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
    SphinxBundles,
    DeploymentState,
    DeploymentStatus,
    BundledSphinxAction,
    RawSphinxAction,
    SphinxActionType,
    SphinxTarget,
    BundledSphinxTarget,
    SphinxActionBundle,
    SphinxTargetBundle,
    BundledSphinxTarget,
    Version
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import { SphinxAuthFactory } from "@sphinx-labs/contracts/contracts/SphinxAuthFactory.sol";
import {
    FoundryConfig,
    Configs,
    BundleInfo,
    FoundryContractConfig,
    ConfigCache,
    DeployContractCost,
    ContractConfigCache,
    DeploymentRevert,
    ImportCache,
    ContractKindEnum,
    ProposalRoute,
    ConfigContractInfo,
    OptionalAddress,
    OptionalBool,
    OptionalString,
    OptionalBytes32
} from "./SphinxPluginTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxContractInfo, SphinxConstants } from "./SphinxConstants.sol";
import { ISphinxUtils } from "./interfaces/ISphinxUtils.sol";

/**
 * @notice This contract should not define mutable variables since it may be delegatecalled
   by other contracts.
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
        bool _isRecurrentBroadcast,
        string memory _mainFfiScriptPath,
        address _systemOwner
    ) external {
        if (_isRecurrentBroadcast) {
            ffiDeployOnAnvil(_rpcUrl, _mainFfiScriptPath);
        }
        ensureSphinxInitialized(_systemOwner);
    }

    function ensureSphinxInitialized(address _systemOwner) public {
        ISphinxRegistry registry = getSphinxRegistry();
        SphinxAuthFactory factory = SphinxAuthFactory(factoryAddress);
        if (address(registry).code.length > 0) {
            return;
        } else {
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
    }

    // These provide an easy way to get structs off-chain via the ABI.
    function actionBundle() external pure returns (SphinxActionBundle memory) {}

    function targetBundle() external pure returns (SphinxTargetBundle memory) {}

    function configCache() external pure returns (ConfigCache memory) {}

    function minimalConfig() external pure returns (FoundryConfig memory) {}

    function deployContractCosts() external pure returns (DeployContractCost[] memory) {}

    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory) {
        return _data[_start:_end];
    }

    /**
     * @notice Retrieves the bundle info via FFI. This function uses `abi.decode` to retrieve any
       errors or warnings that occurred during parsing. We do this instead of letting FFI throw an
       error message because this makes parsing errors much easier to read. This also allows us to
       display parsing warnings, which can't be written to stdout because stdout must be exclusively
       for the bundle info. We also can't write the warnings to stderr because a non-empty stderr
       causes an error to be thrown by Forge.
     */
    function ffiGetEncodedBundleInfo(
        ConfigCache memory _configCache,
        string memory _userConfigStr,
        string memory _rootFfiPath,
        address _owner
    ) external returns (bytes memory) {
        (VmSafe.CallerMode callerMode, , ) = vm.readCallers();
        string[] memory cmds = new string[](7);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = string.concat(_rootFfiPath, "get-bundle-info.js");
        cmds[3] = vm.toString(abi.encode(_configCache));
        cmds[4] = _userConfigStr;
        cmds[5] = vm.toString(callerMode == VmSafe.CallerMode.RecurrentBroadcast);
        cmds[6] = vm.toString(_owner);

        bytes memory result = vm.ffi(cmds);
        return result;
    }

    function decodeBundleInfo(bytes memory _data) public view returns (BundleInfo memory) {
        // The success boolean is the last 32 bytes of the result.
        bytes memory successBytes = this.slice(_data, _data.length - 32, _data.length);
        bool success = abi.decode(successBytes, (bool));

        bytes memory data = this.slice(_data, 0, _data.length - 32);

        if (success) {
            // Next, we decode the result into the bundle info, which consists of the
            // SphinxBundles, the config URI, the cost of deploying each contract, and any
            // warnings that occurred when parsing the config. We can't decode all of this in a
            // single `abi.decode` call because this fails with a "Stack too deep" error. This is
            // because the SphinxBundles struct is too large for Solidity to decode all at once.
            // So, we decode the SphinxActionBundle and SphinxTargetBundle separately. This
            // requires that we know where to split the raw bytes before decoding anything. To solve
            // this, we use two `splitIdx` variables. The first marks the point where the action
            // bundle ends and the target bundle begins. The second marks the point where the target
            // bundle ends and the rest of the bundle info (config URI, warnings, etc) begins.
            (uint256 splitIdx1, uint256 splitIdx2) = abi.decode(
                this.slice(data, data.length - 64, data.length),
                (uint256, uint256)
            );

            SphinxActionBundle memory decodedActionBundle = abi.decode(
                this.slice(data, 0, splitIdx1),
                (SphinxActionBundle)
            );
            SphinxTargetBundle memory decodedTargetBundle = abi.decode(
                this.slice(data, splitIdx1, splitIdx2),
                (SphinxTargetBundle)
            );

            bytes memory remainingBundleInfo = this.slice(data, splitIdx2, data.length);
            (
                string memory configUri,
                DeployContractCost[] memory costs,
                string memory warnings
            ) = abi.decode(remainingBundleInfo, (string, DeployContractCost[], string));

            if (bytes(warnings).length > 0) {
                console.log(StdStyle.yellow(warnings));
            }
            return BundleInfo(configUri, costs, decodedActionBundle, decodedTargetBundle);
        } else {
            (string memory errors, string memory warnings) = abi.decode(data, (string, string));
            if (bytes(warnings).length > 0) {
                console.log(StdStyle.yellow(warnings));
            }
            revert(errors);
        }
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
        bytes32 actionRoot = _actionBundle.root;
        bytes32 targetRoot = _targetBundle.root;
        uint256 numTargets = _targetBundle.targets.length;

        (uint256 numInitialActions, uint256 numSetStorageActions) = getNumActions(_actionBundle.actions);

        return
            keccak256(
                abi.encode(
                    actionRoot,
                    targetRoot,
                    numInitialActions,
                    numSetStorageActions,
                    numTargets,
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
     * Helper function that determines if a given batch is executable within the specified gas limit.
     */
    function executable(
        BundledSphinxAction[] memory selected,
        uint maxGasLimit,
        DeployContractCost[] memory costs
    ) public pure returns (bool) {
        uint256 estGasUsed = 0;

        for (uint i = 0; i < selected.length; i++) {
            BundledSphinxAction memory action = selected[i];

            SphinxActionType actionType = action.action.actionType;
            string memory referenceName = action.action.referenceName;
            if (actionType == SphinxActionType.DEPLOY_CONTRACT) {
                uint256 deployContractCost = findCost(referenceName, costs);

                // We add 150k as an estimate for the cost of the transaction that executes the
                // DeployContract action.
                estGasUsed += deployContractCost + 150_000;
            } else if (actionType == SphinxActionType.SET_STORAGE) {
                estGasUsed += 150_000;
            } else {
                revert("Unknown action type. Should never happen.");
            }
        }
        return maxGasLimit > estGasUsed;
    }

    function findCost(
        string memory referenceName,
        DeployContractCost[] memory costs
    ) public pure returns (uint256) {
        for (uint i = 0; i < costs.length; i++) {
            DeployContractCost memory deployContractCost = costs[i];
            if (equals(deployContractCost.referenceName, referenceName)) {
                return deployContractCost.cost;
            }
        }
        revert(
            "Could not find contract config corresponding to a reference name. Should never happen."
        );
    }

    /**
     * Helper function for finding the maximum number of batch elements that can be executed from a
     * given input list of actions. This is done by performing a binary search over the possible
     * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
     */
    function findMaxBatchSize(
        BundledSphinxAction[] memory actions,
        uint maxGasLimit,
        DeployContractCost[] memory costs
    ) public pure returns (uint) {
        // Optimization, try to execute the entire batch at once before doing a binary search
        if (executable(actions, maxGasLimit, costs)) {
            return actions.length;
        }

        // If the full batch isn't executavle, then do a binary search to find the largest executable batch size
        uint min = 0;
        uint max = actions.length;
        while (min < max) {
            uint mid = Math.ceilDiv((min + max), 2);
            BundledSphinxAction[] memory left = inefficientSlice(actions, 0, mid);
            if (executable(left, maxGasLimit, costs)) {
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
            if (actionType == SphinxActionType.DEPLOY_CONTRACT || actionType == SphinxActionType.CALL) {
                numInitialActions += 1;
            } else if (actionType == SphinxActionType.SET_STORAGE) {
                numSetStorageActions += 1;
            }
        }
        return (numInitialActions, numSetStorageActions);
    }

    function getConfigCache(
        FoundryConfig memory _minimalConfig,
        ISphinxRegistry _registry,
        ISphinxManager _manager,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath
    ) external returns (ConfigCache memory) {
        bool isManagerDeployed_ = _registry.isManagerDeployed(address(_manager));

        ContractConfigCache[] memory contractConfigCache = new ContractConfigCache[](
            _minimalConfig.contracts.length
        );
        for (uint256 i = 0; i < contractConfigCache.length; i++) {
            FoundryContractConfig memory contractConfig = _minimalConfig.contracts[i];

            bool isTargetDeployed = contractConfig.addr.code.length > 0;

            OptionalString memory previousConfigUri = isTargetDeployed &&
                contractConfig.kind != ContractKindEnum.IMMUTABLE
                ? ffiGetPreviousConfigUri(contractConfig.addr, _rpcUrl, _mainFfiScriptPath)
                : OptionalString({ exists: false, value: "" });

            // At this point in the TypeScript version of this function, we attempt to deploy all of
            // the non-proxy contracts. We skip this step here because it's unnecessary in this
            // context. Forge does local simulation before broadcasting any transactions, so if a
            // constructor reverts, it'll be caught before anything happens on the live network.
            DeploymentRevert memory deploymentRevert = DeploymentRevert({
                deploymentReverted: false,
                revertString: OptionalString({ exists: false, value: "" })
            });

            ImportCache memory importCache;
            if (isTargetDeployed) {
                // In the TypeScript version, we check if the SphinxManager has permission to
                // upgrade UUPS proxies via staticcall. We skip it here because staticcall always
                // fails in Solidity when called on a state-changing function (which 'upgradeTo'
                // is). We also can't attempt an external call because it could be broadcasted.
                // So, we skip this step here, which is fine because Forge automatically does local
                // simulation before broadcasting any transactions. If the SphinxManager doesn't
                // have permission to call 'upgradeTo', an error will be thrown when simulating the
                // execution logic, which will happen before any transactions are broadcasted.

                if (
                    contractConfig.kind == ContractKindEnum.EXTERNAL_DEFAULT ||
                    contractConfig.kind == ContractKindEnum.INTERNAL_DEFAULT ||
                    contractConfig.kind == ContractKindEnum.OZ_TRANSPARENT
                ) {
                    // Check that the SphinxManager is the owner of the Transparent proxy.
                    address currProxyAdmin = getEIP1967ProxyAdminAddress(contractConfig.addr);

                    if (currProxyAdmin != address(_manager)) {
                        importCache = ImportCache({
                            requiresImport: true,
                            currProxyAdmin: OptionalAddress({ exists: true, value: currProxyAdmin })
                        });
                    }
                }
            }

            contractConfigCache[i] = ContractConfigCache({
                referenceName: contractConfig.referenceName,
                isTargetDeployed: isTargetDeployed,
                deploymentRevert: deploymentRevert,
                importCache: importCache,
                previousConfigUri: previousConfigUri
            });
        }

        return
            ConfigCache({
                isManagerDeployed: isManagerDeployed_,
                blockGasLimit: block.gaslimit,
                chainId: block.chainid,
                contractConfigCache: contractConfigCache
            });
    }

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

        BundledSphinxAction[] memory filteredActions = new BundledSphinxAction[](numActionsToExecute);
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
        (uint256 numInitialActions, uint256 numSetStorageActions) = getNumActions(
            _actions
        );

        BundledSphinxAction[] memory initialActions = new BundledSphinxAction[](
            numInitialActions
        );
        BundledSphinxAction[] memory setStorageActions = new BundledSphinxAction[](
            numSetStorageActions
        );
        uint initialActionArrayIndex = 0;
        uint setStorageArrayIndex = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (action.action.actionType == SphinxActionType.DEPLOY_CONTRACT || action.action.actionType == SphinxActionType.CALL) {
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
}
