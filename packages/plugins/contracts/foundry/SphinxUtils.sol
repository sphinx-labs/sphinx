// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { CommonBase } from "forge-std/Base.sol";
import { VmSafe } from "forge-std/Vm.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import "forge-std/Script.sol";
import "forge-std/Test.sol";
import { StdStyle } from "forge-std/StdStyle.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { IOwnable } from "@sphinx-labs/contracts/contracts/interfaces/IOwnable.sol";
import { SphinxManagerEvents } from "@sphinx-labs/contracts/contracts/SphinxManagerEvents.sol";
import { SphinxRegistryEvents } from "@sphinx-labs/contracts/contracts/SphinxRegistryEvents.sol";
import {
    RawSphinxAction,
    DeploymentState,
    DeploymentStatus,
    SphinxActionType,
    SphinxTarget,
    Version,
    AuthLeaf
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import { SphinxAuthFactory } from "@sphinx-labs/contracts/contracts/SphinxAuthFactory.sol";
import {
    SphinxBundles,
    BundledSphinxAction,
    BundledSphinxTarget,
    SphinxActionBundle,
    BundledSphinxAction,
    SphinxTargetBundle,
    BundledSphinxTarget,
    BundleInfo,
    ChainInfo,
    HumanReadableAction,
    ContractKindEnum,
    ProposalRoute,
    ConfigContractInfo,
    OptionalAddress,
    OptionalBool,
    OptionalString,
    OptionalBytes32,
    ParsedCallAction,
    SphinxAction,
    SphinxAuthBundle,
    BundledAuthLeaf,
    BundledAuthLeafJson,
    BundledSphinxActionJson,
    AuthLeafType
} from "./SphinxPluginTypes.sol";
import { Semver } from "@sphinx-labs/contracts/contracts/Semver.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxContractInfo, SphinxConstants } from "./SphinxConstants.sol";
import { ISphinxUtils } from "./interfaces/ISphinxUtils.sol";

/**
 * @notice This contract should not define mutable variables since it may be delegatecalled by other
   contracts.
 */
contract SphinxUtils is
    Test,
    SphinxConstants,
    SphinxManagerEvents,
    SphinxRegistryEvents,
    ISphinxUtils
{
    // Source: https://github.com/Arachnid/deterministic-deployment-proxy
    address public constant DETERMINISTIC_DEPLOYMENT_PROXY =
        0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function initialize(
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        address _systemOwner
    ) external {
        ISphinxRegistry registry = getSphinxRegistry();
        if (address(registry).code.length == 0) {
            ffiDeployOnAnvil(_rpcUrl, _mainFfiScriptPath);
            ensureSphinxInitialized(_systemOwner);
        }
    }


    // TODO(parse): throw an error if isLiveNetwork and registry isn't deployed
    function ensureSphinxInitialized(address _systemOwner) public {
        ISphinxRegistry registry = getSphinxRegistry();
        SphinxAuthFactory factory = SphinxAuthFactory(authFactoryAddress);
            vm.etch(
                DETERMINISTIC_DEPLOYMENT_PROXY,
                hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
            );

            SphinxContractInfo[] memory contracts = getSphinxContractInfo();
            for (uint i = 0; i < contracts.length; i++) {
                SphinxContractInfo memory ct = contracts[i];
                address addr = create2Deploy(ct.creationCode);
                require(
                    addr == ct.expectedAddress,
                    string.concat(
                        "address mismatch. expected address: ",
                        vm.toString(ct.expectedAddress)
                    )
                );
            }

            // Impersonate system owner
            vm.startPrank(_systemOwner);

            // Add initial manager version
            registry.addVersion(managerImplementationAddress);

            // Set the default manager version
            registry.setCurrentManagerImplementation(managerImplementationAddress);

            factory.addVersion(authImplV1Address);

            factory.setCurrentAuthImplementation(authImplV1Address);

            // Add transparent proxy type
            registry.addContractKind(keccak256("oz-transparent"), ozTransparentAdapterAddr);

            // Add uups ownable proxy type
            registry.addContractKind(keccak256("oz-ownable-uups"), ozUUPSOwnableAdapterAddr);

            // Add uups access control proxy type
            registry.addContractKind(
                keccak256("oz-access-control-uups"),
                ozUUPSAccessControlAdapterAddr
            );

            // Add default proxy type
            registry.addContractKind(bytes32(0), defaultAdapterAddr);

            vm.stopPrank();
    }

    // These provide an easy way to get complex data types off-chain (via the ABI) without needing
    // to hard-code them.
    function bundledActions() external pure returns (BundledSphinxAction[] memory) {}

    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory) {
        return _data[_start:_end];
    }

    function ffiGetEncodedBundleInfo(
        ChainInfo memory _chainInfo,
        string memory _rootFfiPath
    ) external returns (bytes memory) {
        string[] memory cmds = new string[](4);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = string.concat(_rootFfiPath, "get-bundle-info.js");
        cmds[3] = vm.toString(abi.encode(_chainInfo));

        Vm.FfiResult memory result = vm.tryFfi(cmds);
        if (result.exit_code == 1) {
            revert(string(result.stderr));
        }
        return result.stdout;
    }

    // TODO(docs): can't decode all at once b/c of "stack too deep" error.
    function decodeBundleInfo(
        bytes memory _data
    ) external pure returns (BundleInfo memory) {
        string memory configUri = abi.decode(vm.parseJson(string(_data), ".configUri"), (string));
        HumanReadableAction[] memory humanReadableActions = abi.decode(vm.parseJson(string(_data), ".humanReadableActions"), (HumanReadableAction[]));
        bytes32 actionRoot = abi.decode(vm.parseJson(string(_data), ".bundles.actionBundle.root"), (bytes32));
        BundledSphinxActionJson[] memory actionsJson = abi.decode(vm.parseJson(string(_data), ".bundles.actionBundle.actions"), (BundledSphinxActionJson[]));
        BundledSphinxAction[] memory actions = new BundledSphinxAction[](actionsJson.length);
        for (uint i = 0; i < actionsJson.length; i++) {
            BundledSphinxActionJson memory actionJson = actionsJson[i];
            actions[i] = BundledSphinxAction({
                action: RawSphinxAction({
                    actionType: SphinxActionType(actionJson.action.actionType),
                    index: actionJson.action.index,
                    data: actionJson.action.data
                }),
                gas: actionJson.gas,
                siblings: actionJson.siblings
            });
        }

        // TODO: you need to separate the 'data' field of the action bundle like you did with the auth bundle.

        SphinxTargetBundle memory targetBundle = abi.decode(vm.parseJson(string(_data), ".bundles.targetBundle"), (SphinxTargetBundle));
        bytes32 authRoot = abi.decode(vm.parseJson(string(_data), ".bundles.authBundle.root"), (bytes32));
        BundledAuthLeafJson[] memory authLeafsJson = abi.decode(vm.parseJson(string(_data), ".bundles.authBundle.leafs"), (BundledAuthLeafJson[]));
        bytes[] memory authData = vm.parseJsonBytesArray(string(_data), ".bundles.authBundle.data");
        BundledAuthLeaf[] memory authLeafs = new BundledAuthLeaf[](authLeafsJson.length);
        for (uint i = 0; i < authLeafsJson.length; i++) {
            BundledAuthLeafJson memory authLeafJson = authLeafsJson[i];
            authLeafs[i] = BundledAuthLeaf({
                leaf: AuthLeaf({
                    chainId: authLeafJson.leaf.chainId,
                    index: authLeafJson.leaf.index,
                    to: authLeafJson.leaf.to,
                    data: authData[i]
                }),
                leafType: AuthLeafType(authLeafJson.leafType),
                proof: authLeafJson.proof
            });
        }

        return BundleInfo({
            configUri: configUri,
            humanReadableActions: humanReadableActions,
            bundles: SphinxBundles({
                actionBundle: SphinxActionBundle({
                    root: actionRoot,
                    actions: actions
                }),
                targetBundle: targetBundle,
                authBundle: SphinxAuthBundle({
                    root: authRoot,
                    leafs: authLeafs
                })
            })
        });
    }

    // Provides an easy way to get the EOA that's signing transactions in a Forge script. When a
    // user specifies a signer in a Forge script, the address is only available in the context of an
    // an external call.The easiest way to reliably retrieve the address is to call an external
    // function that returns the msg.sender.
    function msgSender() external view returns (address) {
        return msg.sender;
    }

    function ffiDeployOnAnvil(string memory _rpcUrl, string memory _mainFfiScriptPath) public {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = _mainFfiScriptPath;
        cmds[3] = "deployOnAnvil";
        cmds[4] = _rpcUrl;

        vm.ffi(cmds);
    }

    function getSphinxRegistry() public pure returns (ISphinxRegistry) {
        return ISphinxRegistry(registryAddress);
    }

    function getEIP1967ProxyAdminAddress(address _proxyAddress) public view returns (address) {
        // The EIP-1967 storage slot that holds the address of the owner.
        // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
        bytes32 ownerKey = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

        bytes32 ownerBytes32 = vm.load(_proxyAddress, ownerKey);

        // Convert the bytes32 value to an address.
        return address(uint160(uint256(ownerBytes32)));
    }

    function getDeploymentId(
        SphinxActionBundle memory _actionBundle,
        SphinxTargetBundle memory _targetBundle,
        string memory _configUri
    ) external pure returns (bytes32) {
        (uint256 numInitialActions, uint256 numSetStorageActions) = getNumActions(
            _actionBundle.actions
        );

        return
            keccak256(
                abi.encode(
                    _actionBundle.root,
                    _targetBundle.root,
                    numInitialActions,
                    numSetStorageActions,
                    _targetBundle.targets.length,
                    _configUri
                )
            );
    }

    function getCurrentSphinxManagerVersion() public pure returns (Version memory) {
        return Version({ major: major, minor: minor, patch: patch });
    }

    function create2Deploy(bytes memory _creationCode) public returns (address) {
        address addr = Create2.computeAddress(
            bytes32(0),
            keccak256(_creationCode),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        if (addr.code.length == 0) {
            bytes memory code = bytes.concat(bytes32(0), _creationCode);
            (bool success, ) = DETERMINISTIC_DEPLOYMENT_PROXY.call(code);
            require(
                success,
                string.concat("failed to deploy contract. expected address: ", vm.toString(addr))
            );
        }

        return addr;
    }

    function inefficientSlice(
        BundledSphinxAction[] memory selected,
        uint start,
        uint end
    ) public pure returns (BundledSphinxAction[] memory sliced) {
        sliced = new BundledSphinxAction[](end - start);
        for (uint i = start; i < end; i++) {
            sliced[i - start] = selected[i];
        }
    }

    /**
     * @notice Splits up a bundled action into its components
     */
    function disassembleActions(
        BundledSphinxAction[] memory actions
    ) public pure returns (RawSphinxAction[] memory, bytes32[][] memory) {
        RawSphinxAction[] memory rawActions = new RawSphinxAction[](actions.length);
        bytes32[][] memory _proofs = new bytes32[][](actions.length);
        for (uint i = 0; i < actions.length; i++) {
            BundledSphinxAction memory action = actions[i];
            rawActions[i] = action.action;
            _proofs[i] = action.siblings;
        }

        return (rawActions, _proofs);
    }

    /**
     * Helper function that determines if a given batch is executable within the specified gas
       limit.
     */
    function executable(
        BundledSphinxAction[] memory selected,
        uint maxGasLimit
    ) public pure returns (bool) {
        uint256 estGasUsed = 0;

        for (uint i = 0; i < selected.length; i++) {
            estGasUsed += selected[i].gas;
        }
        return maxGasLimit > estGasUsed;
    }

    /**
     * Helper function for finding the maximum number of batch elements that can be executed from a
     * given input list of actions. This is done by performing a binary search over the possible
     * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
     */
    function findMaxBatchSize(
        BundledSphinxAction[] memory actions,
        uint maxGasLimit
    ) public pure returns (uint) {
        // Optimization, try to execute the entire batch at once before doing a binary search
        if (executable(actions, maxGasLimit)) {
            return actions.length;
        }

        // If the full batch isn't executavle, then do a binary search to find the largest
        // executable batch size
        uint min = 0;
        uint max = actions.length;
        while (min < max) {
            uint mid = Math.ceilDiv((min + max), 2);
            BundledSphinxAction[] memory left = inefficientSlice(actions, 0, mid);
            if (executable(left, maxGasLimit)) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }

        // No possible size works, this is a problem and should never happen
        if (min == 0) {
            revert("Unable to find a batch size that does not exceed the block gas limit");
        }

        return min;
    }

    function equals(string memory _str1, string memory _str2) public pure returns (bool) {
        return keccak256(abi.encodePacked(_str1)) == keccak256(abi.encodePacked(_str2));
    }

    function toBytes32(address _addr) public pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    function getNumActions(
        BundledSphinxAction[] memory _actions
    ) public pure returns (uint256, uint256) {
        uint256 numInitialActions = 0;
        uint256 numSetStorageActions = 0;
        for (uint256 i = 0; i < _actions.length; i++) {
            SphinxActionType actionType = _actions[i].action.actionType;
            if (
                actionType == SphinxActionType.DEPLOY_CONTRACT ||
                actionType == SphinxActionType.CALL
            ) {
                numInitialActions += 1;
            } else if (actionType == SphinxActionType.SET_STORAGE) {
                numSetStorageActions += 1;
            }
        }
        return (numInitialActions, numSetStorageActions);
    }

    // TODO: in the new propose function, do a local simulation before proposing. you may need to invoke a forge script to do this.

    function ffiGetPreviousConfigUri(
        address _proxyAddress,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath
    ) public returns (OptionalString memory) {
        string[] memory cmds = new string[](6);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = _mainFfiScriptPath;
        cmds[3] = "getPreviousConfigUri";
        cmds[4] = _rpcUrl;
        cmds[5] = vm.toString(_proxyAddress);

        bytes memory result = vm.ffi(cmds);

        (bool exists, string memory configUri) = abi.decode(result, (bool, string));

        return OptionalString({ exists: exists, value: configUri });
    }

    function removeSelector(bytes memory _data) external view returns (bytes memory) {
        if (_data.length < 4) {
            return _data;
        }
        return this.slice(_data, 4, _data.length);
    }

    function removeExecutedActions(
        BundledSphinxAction[] memory _actions,
        uint256 _actionsExecuted
    ) external pure returns (BundledSphinxAction[] memory) {
        uint numActionsToExecute = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (action.action.index >= _actionsExecuted) {
                numActionsToExecute += 1;
            }
        }

        BundledSphinxAction[] memory filteredActions = new BundledSphinxAction[](
            numActionsToExecute
        );
        uint filteredArrayIndex = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (action.action.index >= _actionsExecuted) {
                filteredActions[filteredArrayIndex] = action;
                filteredArrayIndex += 1;
            }
        }
        return filteredActions;
    }

    function splitActions(
        BundledSphinxAction[] memory _actions
    ) external pure returns (BundledSphinxAction[] memory, BundledSphinxAction[] memory) {
        (uint256 numInitialActions, uint256 numSetStorageActions) = getNumActions(_actions);

        BundledSphinxAction[] memory initialActions = new BundledSphinxAction[](numInitialActions);
        BundledSphinxAction[] memory setStorageActions = new BundledSphinxAction[](
            numSetStorageActions
        );
        uint initialActionArrayIndex = 0;
        uint setStorageArrayIndex = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (
                action.action.actionType == SphinxActionType.DEPLOY_CONTRACT ||
                action.action.actionType == SphinxActionType.CALL
            ) {
                initialActions[initialActionArrayIndex] = action;
                initialActionArrayIndex += 1;
            } else if (action.action.actionType == SphinxActionType.SET_STORAGE) {
                setStorageActions[setStorageArrayIndex] = action;
                setStorageArrayIndex += 1;
            }
        }
        return (initialActions, setStorageActions);
    }

    function getCodeSize(address _addr) external view returns (uint256) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size;
    }

    function getCallHash(address _to, bytes memory _data) private pure returns (bytes32) {
        return keccak256(abi.encode(_to, _data));
    }

    /**
     * @notice Returns an array of unique addresses from a given array of addresses, which may
     *         contain duplicates.
     *
     * @param _addresses An array of addresses that may contain duplicates.
     */
    function getUniqueAddresses(
        address[] memory _addresses
    ) internal pure returns (address[] memory) {
        // First, we get an array of unique addresses. We do this by iterating over the input array
        // and adding each address to a new array if it hasn't been added already.
        address[] memory uniqueAddresses = new address[](_addresses.length);
        uint256 uniqueAddressCount = 0;
        for (uint256 i = 0; i < _addresses.length; i++) {
            bool isUnique = true;
            // Check if the address has already been added to the uniqueAddresses array.
            for (uint256 j = 0; j < uniqueAddressCount; j++) {
                if (_addresses[i] == uniqueAddresses[j]) {
                    isUnique = false;
                    break;
                }
            }
            // If the address hasn't been added yet, add it to the uniqueAddresses array.
            if (isUnique) {
                uniqueAddresses[uniqueAddressCount] = _addresses[i];
                uniqueAddressCount += 1;
            }
        }

        // Next, we create a new array with the correct length and copy the unique addresses into
        // it. This is necessary because the uniqueAddresses array may contain empty addresses at
        // the end.
        address[] memory trimmedUniqueAddresses = new address[](uniqueAddressCount);
        for (uint256 i = 0; i < uniqueAddressCount; i++) {
            trimmedUniqueAddresses[i] = uniqueAddresses[i];
        }

        return trimmedUniqueAddresses;
    }
}
