// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { CommonBase } from "forge-std/Base.sol";
import { VmSafe } from "forge-std/Vm.sol";
import { strings } from "./lib/strings.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import "forge-std/Script.sol";
import "forge-std/Test.sol";
import { StdStyle } from "forge-std/StdStyle.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import {
    IChugSplashRegistry
} from "@chugsplash/contracts/contracts/interfaces/IChugSplashRegistry.sol";
import {
    IChugSplashManager
} from "@chugsplash/contracts/contracts/interfaces/IChugSplashManager.sol";
import { IOwnable } from "@chugsplash/contracts/contracts/interfaces/IOwnable.sol";
import {
    ChugSplashManagerEvents
} from "@chugsplash/contracts/contracts/ChugSplashManagerEvents.sol";
import {
    ChugSplashRegistryEvents
} from "@chugsplash/contracts/contracts/ChugSplashRegistryEvents.sol";
import {
    ChugSplashBundles,
    DeploymentState,
    DeploymentStatus,
    BundledChugSplashAction,
    RawChugSplashAction,
    ChugSplashActionType,
    ChugSplashTarget,
    BundledChugSplashTarget,
    ChugSplashActionBundle,
    ChugSplashTargetBundle,
    BundledChugSplashTarget,
    Version
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import {
    MinimalConfig,
    Configs,
    BundleInfo,
    MinimalContractConfig,
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
} from "./ChugSplashPluginTypes.sol";
import { ChugSplashUtils } from "./ChugSplashUtils.sol";
import { ChugSplashContractInfo, ChugSplashConstants } from "./ChugSplashConstants.sol";
import { IChugSplashUtils } from "./interfaces/IChugSplashUtils.sol";

/**
 * @notice This contract should not define mutable variables since it may be delegatecalled
   by other contracts.
 */
contract ChugSplashUtils is
    Test,
    ChugSplashConstants,
    ChugSplashManagerEvents,
    ChugSplashRegistryEvents,
    IChugSplashUtils
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
        if (isLocalNetwork(_rpcUrl) && _isRecurrentBroadcast) {
            ffiDeployOnAnvil(_rpcUrl, _mainFfiScriptPath);
        }
        ensureChugSplashInitialized(_rpcUrl, _systemOwner);
    }

    function ensureChugSplashInitialized(string memory _rpcUrl, address _systemOwner) public {
        IChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashAuthFactory authFactory = ChugSplashAuthFactory(authFactoryAddress);
        if (address(registry).code.length > 0) {
            return;
        } else if (isLocalNetwork(_rpcUrl)) {
            vm.etch(
                DETERMINISTIC_DEPLOYMENT_PROXY,
                hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
            );

            ChugSplashContractInfo[] memory contracts = getChugSplashContractInfo();
            for (uint i = 0; i < contracts.length; i++) {
                ChugSplashContractInfo memory ct = contracts[i];
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

            authFactory.addVersion(authImplV1Address);

            authFactory.setCurrentAuthImplementation(authImplV1Address);

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
        } else {
            revert(
                "ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!"
            );
        }
    }

    /**
     * @notice Returns true if the current network is either the in-process or standalone Anvil
     * node. Returns false if the current network is a forked or live network.
     */
    function isLocalNetwork(string memory _rpcUrl) public pure returns (bool) {
        strings.slice memory sliceUrl = strings.toSlice(_rpcUrl);
        strings.slice memory delim = strings.toSlice(":");
        string[] memory parts = new string[](strings.count(sliceUrl, delim) + 1);
        for (uint i = 0; i < parts.length; i++) {
            parts[i] = strings.toString(strings.split(sliceUrl, delim));
        }
        if (parts.length < 2) {
            revert(
                string.concat(
                    _rpcUrl,
                    " is not a valid RPC url."
                )
            );
        }
        string memory host = parts[1];

        if (equals(host, "//127.0.0.1") || equals(host, "//localhost")) {
            return true;
        } else {
            return false;
        }
    }

    // These provide an easy way to get structs off-chain via the ABI.
    function actionBundle() external pure returns (ChugSplashActionBundle memory) {}

    function targetBundle() external pure returns (ChugSplashTargetBundle memory) {}

    function configCache() external pure returns (ConfigCache memory) {}

    function minimalConfig() external pure returns (MinimalConfig memory) {}

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
        string memory _projectName,
        string memory _userConfigStr,
        string memory _rootFfiPath,
        address _owner
    ) external returns (bytes memory) {
        (VmSafe.CallerMode callerMode, , ) = vm.readCallers();
        string[] memory cmds = new string[](8);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = string.concat(_rootFfiPath, "get-bundle-info.js");
        cmds[3] = vm.toString(abi.encode(_configCache));
        cmds[4] = _userConfigStr;
        cmds[5] = vm.toString(callerMode == VmSafe.CallerMode.RecurrentBroadcast);
        cmds[6] = _projectName;
        cmds[7] = vm.toString(_owner);

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
            // ChugSplashBundles, the config URI, the cost of deploying each contract, and any
            // warnings that occurred when parsing the config. We can't decode all of this in a
            // single `abi.decode` call because this fails with a "Stack too deep" error. This is
            // because the ChugSplashBundles struct is too large for Solidity to decode all at once.
            // So, we decode the ChugSplashActionBundle and ChugSplashTargetBundle separately. This
            // requires that we know where to split the raw bytes before decoding anything. To solve
            // this, we use two `splitIdx` variables. The first marks the point where the action
            // bundle ends and the target bundle begins. The second marks the point where the target
            // bundle ends and the rest of the bundle info (config URI, warnings, etc) begins.
            (uint256 splitIdx1, uint256 splitIdx2) = abi.decode(
                this.slice(data, data.length - 64, data.length),
                (uint256, uint256)
            );

            ChugSplashActionBundle memory decodedActionBundle = abi.decode(
                this.slice(data, 0, splitIdx1),
                (ChugSplashActionBundle)
            );
            ChugSplashTargetBundle memory decodedTargetBundle = abi.decode(
                this.slice(data, splitIdx1, splitIdx2),
                (ChugSplashTargetBundle)
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

    function getChugSplashRegistry() public pure returns (IChugSplashRegistry) {
        return IChugSplashRegistry(registryAddress);
    }

    function isProjectRegistered(
        IChugSplashRegistry _registry,
        address _manager
    ) public view returns (bool) {
        return _registry.isDeployed(_manager);
    }

    function getDeployedCreationCodeWithArgsHash(
        IChugSplashManager _manager,
        string memory _referenceName,
        address _contractAddress,
        Vm.Log[] memory _executionLogs
    ) public pure returns (OptionalBytes32 memory) {
        OptionalLog memory latestDeploymentEvent = getLatestEvent(
            _executionLogs,
            address(_manager),
            ContractDeployed.selector,
            OptionalBytes32({ exists: true, value: keccak256(bytes(_referenceName)) }),
            OptionalBytes32({ exists: true, value: toBytes32(_contractAddress) }),
            OptionalBytes32({ exists: false, value: bytes32(0) })
        );

        if (!latestDeploymentEvent.exists) {
            return OptionalBytes32({ exists: false, value: bytes32(0) });
        } else {
            (, , bytes32 creationCodeWithArgsHash) = abi.decode(
                latestDeploymentEvent.value.data,
                (string, uint256, bytes32)
            );
            return OptionalBytes32({ exists: true, value: creationCodeWithArgsHash });
        }
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
        ChugSplashActionBundle memory _actionBundle,
        ChugSplashTargetBundle memory _targetBundle,
        string memory _configUri,
        string memory _projectName
    ) external pure returns (bytes32) {
        bytes32 actionRoot = _actionBundle.root;
        bytes32 targetRoot = _targetBundle.root;
        uint256 numActions = _actionBundle.actions.length;
        uint256 numTargets = _targetBundle.targets.length;
        (uint256 numImmutableContracts, ) = getNumActions(_actionBundle.actions);

        return
            keccak256(
                abi.encode(
                    _projectName,
                    actionRoot,
                    targetRoot,
                    numActions,
                    numTargets,
                    numImmutableContracts,
                    _configUri
                )
            );
    }

    /**
     * @notice This function retrieves the most recent event emitted by the given emitter that
     *         matches the topics. It relies on the logs collected in this contract via
     *         `vm.getRecordedLogs`. It can only be used on Anvil networks. It operates in the same
     *         manner as Ethers.js' `queryFilter` function, except it retrieves only the most recent
     *         event that matches the topics instead of a list of all the events that match.
     *
     * @param _emitter The address of the contract that emitted the event.
     * @param _topic1  The first topic of the event. This is the event selector unless the event is
     *                 anonymous.
     * @param _topic2  The second topic of the event. If omitted, it won't be used to filter the
     *                 events.
     * @param _topic3  The third topic of the event. If omitted, it won't be used to filter the
     *                 events.
     * @param _topic4  The fourth topic of the event. If omitted, it won't be used to filter the
     *                 events.
     */
    function getLatestEvent(
        Vm.Log[] memory _executionLogs,
        address _emitter,
        bytes32 _topic1,
        OptionalBytes32 memory _topic2,
        OptionalBytes32 memory _topic3,
        OptionalBytes32 memory _topic4
    ) public pure returns (OptionalLog memory) {
        // We iterate over the events in descending order because the most recent event is at the
        // end of the array.
        for (uint256 i = _executionLogs.length - 1; i >= 0; i--) {
            Vm.Log memory log = _executionLogs[i];
            uint256 numTopics = log.topics.length;
            if (
                log.emitter == _emitter &&
                (numTopics > 0 && _topic1 == log.topics[0]) &&
                (!_topic2.exists || (numTopics > 1 && _topic2.value == log.topics[1])) &&
                (!_topic3.exists || (numTopics > 2 && _topic3.value == log.topics[2])) &&
                (!_topic4.exists || (numTopics > 3 && _topic4.value == log.topics[3]))
            ) {
                return OptionalLog({ exists: true, value: log });
            }
        }
        // Return an empty log if no event was found.
        Vm.Log memory emptyLog;
        return OptionalLog({ exists: false, value: emptyLog });
    }

    function getCurrentChugSplashManagerVersion() public pure returns (Version memory) {
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
        BundledChugSplashAction[] memory selected,
        uint start,
        uint end
    ) public pure returns (BundledChugSplashAction[] memory sliced) {
        sliced = new BundledChugSplashAction[](end - start);
        for (uint i = start; i < end; i++) {
            sliced[i - start] = selected[i];
        }
    }

    /**
     * @notice Splits up a bundled action into its components
     */
    function disassembleActions(
        BundledChugSplashAction[] memory actions
    ) public pure returns (RawChugSplashAction[] memory, uint256[] memory, bytes32[][] memory) {
        RawChugSplashAction[] memory rawActions = new RawChugSplashAction[](actions.length);
        uint256[] memory _actionIndexes = new uint256[](actions.length);
        bytes32[][] memory _proofs = new bytes32[][](actions.length);
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            rawActions[i] = action.action;
            _actionIndexes[i] = action.proof.actionIndex;
            _proofs[i] = action.proof.siblings;
        }

        return (rawActions, _actionIndexes, _proofs);
    }

    /**
     * Helper function that determines if a given batch is executable within the specified gas limit.
     */
    function executable(
        BundledChugSplashAction[] memory selected,
        uint maxGasLimit,
        DeployContractCost[] memory costs
    ) public pure returns (bool) {
        uint256 estGasUsed = 0;

        for (uint i = 0; i < selected.length; i++) {
            BundledChugSplashAction memory action = selected[i];

            ChugSplashActionType actionType = action.action.actionType;
            string memory referenceName = action.action.referenceName;
            if (actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                uint256 deployContractCost = findCost(referenceName, costs);

                // We add 150k as an estimate for the cost of the transaction that executes the
                // DeployContract action.
                estGasUsed += deployContractCost + 150_000;
            } else if (actionType == ChugSplashActionType.SET_STORAGE) {
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
        BundledChugSplashAction[] memory actions,
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
            BundledChugSplashAction[] memory left = inefficientSlice(actions, 0, mid);
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

    function getChainAlias(string memory _rpcUrl) public view returns (string memory) {
        Vm.Rpc[] memory urls = vm.rpcUrlStructs();
        for (uint i = 0; i < urls.length; i++) {
            Vm.Rpc memory rpc = urls[i];
            if (equals(rpc.url, _rpcUrl)) {
                return rpc.key;
            }
        }
        revert(
            string.concat(
                "Could not find the chain alias for the RPC url: ",
                _rpcUrl,
                ". Did you forget to define it in your foundry.toml?"
            )
        );
    }

    function getNumActions(
        BundledChugSplashAction[] memory _actions
    ) public pure returns (uint256, uint256) {
        uint256 numDeployContractActions = 0;
        uint256 numSetStorageActions = 0;
        for (uint256 i = 0; i < _actions.length; i++) {
            ChugSplashActionType actionType = _actions[i].action.actionType;
            if (actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                numDeployContractActions += 1;
            } else if (actionType == ChugSplashActionType.SET_STORAGE) {
                numSetStorageActions += 1;
            }
        }
        return (numDeployContractActions, numSetStorageActions);
    }

    function getConfigCache(
        MinimalConfig memory _minimalConfig,
        IChugSplashRegistry _registry,
        IChugSplashManager _manager,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        Vm.Log[] memory _executionLogs
    ) external returns (ConfigCache memory) {
        bool isRegistered = isProjectRegistered(_registry, address(_manager));

        ContractConfigCache[] memory contractConfigCache = new ContractConfigCache[](
            _minimalConfig.contracts.length
        );
        for (uint256 i = 0; i < contractConfigCache.length; i++) {
            MinimalContractConfig memory contractConfig = _minimalConfig.contracts[i];

            string memory existingProjectName = isRegistered
                ? _manager.contractToProject(contractConfig.addr)
                : "";

            bool isTargetDeployed = contractConfig.addr.code.length > 0;

            OptionalString memory previousConfigUri = isTargetDeployed &&
                contractConfig.kind != ContractKindEnum.IMMUTABLE
                ? getPreviousConfigUri(
                    _registry,
                    contractConfig.addr,
                    isLocalNetwork(_rpcUrl),
                    _rpcUrl,
                    _mainFfiScriptPath,
                    _executionLogs
                )
                : OptionalString({ exists: false, value: "" });

            OptionalBytes32 memory deployedCreationCodeWithArgsHash = isTargetDeployed
                ? getDeployedCreationCodeWithArgsHash(
                    _manager,
                    contractConfig.referenceName,
                    contractConfig.addr,
                    _executionLogs
                )
                : OptionalBytes32({ exists: false, value: "" });

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
                // In the TypeScript version, we check if the ChugSplashManager has permission to
                // upgrade UUPS proxies via staticcall. We skip it here because staticcall always
                // fails in Solidity when called on a state-changing function (which 'upgradeTo'
                // is). We also can't attempt an external call because it could be broadcasted.
                // So, we skip this step here, which is fine because Forge automatically does local
                // simulation before broadcasting any transactions. If the ChugSplashManager doesn't
                // have permission to call 'upgradeTo', an error will be thrown when simulating the
                // execution logic, which will happen before any transactions are broadcasted.

                if (
                    contractConfig.kind == ContractKindEnum.EXTERNAL_DEFAULT ||
                    contractConfig.kind == ContractKindEnum.INTERNAL_DEFAULT ||
                    contractConfig.kind == ContractKindEnum.OZ_TRANSPARENT
                ) {
                    // Check that the ChugSplashManager is the owner of the Transparent proxy.
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
                existingProjectName: existingProjectName,
                referenceName: contractConfig.referenceName,
                isTargetDeployed: isTargetDeployed,
                deployedCreationCodeWithArgsHash: deployedCreationCodeWithArgsHash,
                deploymentRevert: deploymentRevert,
                importCache: importCache,
                previousConfigUri: previousConfigUri
            });
        }

        return
            ConfigCache({
                isRegistered: isRegistered,
                blockGasLimit: block.gaslimit,
                localNetwork: isLocalNetwork(_rpcUrl),
                networkName: getChainAlias(_rpcUrl),
                contractConfigCache: contractConfigCache
            });
    }

    function getPreviousConfigUri(
        IChugSplashRegistry _registry,
        address _proxyAddress,
        bool _localNetwork,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        Vm.Log[] memory _executionLogs
    ) public returns (OptionalString memory) {
        if (!_localNetwork) {
            // We rely on FFI for non-Anvil networks because the previous config URI
            // could correspond to a deployment that happened before this script was
            // called.
            return ffiGetPreviousConfigUri(_proxyAddress, _rpcUrl, _mainFfiScriptPath);
        } else {
            // We can't rely on FFI for the in-process Anvil node because there is no accessible
            // provider to use in TypeScript. So, we use the logs collected in this contract to get
            // the previous config URI.
            OptionalLog memory latestRegistryEvent = getLatestEvent(
                _executionLogs,
                address(_registry),
                EventAnnouncedWithData.selector,
                OptionalBytes32({ exists: true, value: keccak256("ProxyUpgraded") }),
                OptionalBytes32({ exists: false, value: bytes32(0) }),
                OptionalBytes32({ exists: true, value: keccak256(abi.encodePacked(_proxyAddress)) })
            );

            if (!latestRegistryEvent.exists) {
                return OptionalString({ exists: false, value: "" });
            }

            // The ChugSplashManager's address is stored as a topic in the ProxyUpgraded event.
            address manager = abi.decode(
                bytes.concat(latestRegistryEvent.value.topics[2]),
                (address)
            );

            OptionalBytes32 memory proxyTopic = OptionalBytes32({
                exists: true,
                value: toBytes32(_proxyAddress)
            });
            OptionalLog memory latestUpgradeEvent = getLatestEvent(
                _executionLogs,
                manager,
                ProxyUpgraded.selector,
                OptionalBytes32({ exists: false, value: bytes32(0) }),
                proxyTopic,
                OptionalBytes32({ exists: false, value: bytes32(0) })
            );

            if (!latestUpgradeEvent.exists) {
                return OptionalString({ exists: false, value: "" });
            }

            bytes32 deploymentId = latestUpgradeEvent.value.topics[1];
            DeploymentState memory deploymentState = IChugSplashManager(payable(manager))
                .deployments(deploymentId);

            return OptionalString({ exists: true, value: deploymentState.configUri });
        }
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

    function getActionsByType(
        ChugSplashActionBundle memory _actionBundle
    ) external pure returns (BundledChugSplashAction[] memory, BundledChugSplashAction[] memory) {
        // Get number of deploy contract and set state actions
        (uint256 numDeployContractActions, uint256 numSetStorageActions) = getNumActions(
            _actionBundle.actions
        );

        // Split up the deploy contract and set storage actions
        BundledChugSplashAction[] memory deployContractActions = new BundledChugSplashAction[](
            numDeployContractActions
        );
        BundledChugSplashAction[] memory setStorageActions = new BundledChugSplashAction[](
            numSetStorageActions
        );
        uint deployContractIndex = 0;
        uint setStorageIndex = 0;
        for (uint i = 0; i < _actionBundle.actions.length; i++) {
            BundledChugSplashAction memory action = _actionBundle.actions[i];
            if (action.action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                deployContractActions[deployContractIndex] = action;
                deployContractIndex += 1;
            } else {
                setStorageActions[setStorageIndex] = action;
                setStorageIndex += 1;
            }
        }
        return (deployContractActions, setStorageActions);
    }

    function getCodeSize(address _addr) external view returns (uint256) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size;
    }
}
