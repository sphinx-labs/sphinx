// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { Script } from "forge-std/Script.sol";
import { VmSafe } from "forge-std/Vm.sol";
import { console } from "forge-std/console.sol";

import { IChugSplashRegistry } from "@chugsplash/contracts/contracts/interfaces/IChugSplashRegistry.sol";
import { IChugSplashManager } from "@chugsplash/contracts/contracts/interfaces/IChugSplashManager.sol";
import { IOwnable } from "@chugsplash/contracts/contracts/interfaces/IOwnable.sol";
import {
    DeploymentState,
    Version,
    DeploymentStatus,
    BundledChugSplashAction,
    RawChugSplashAction,
    ChugSplashTarget,
    BundledChugSplashTarget,
    ChugSplashActionBundle,
    ChugSplashTargetBundle
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import {
    MinimalConfig,
    Configs,
    BundleInfo,
    MinimalContractConfig,
    ConfigCache,
    DeployContractCost,
    OptionalAddress
} from "./ChugSplashPluginTypes.sol";
import { IChugSplashUtils } from "./interfaces/IChugSplashUtils.sol";

contract ChugSplash is Script {

    VmSafe.Log[] private executionLogs;
    bool internal silent;

    // Maps a ChugSplash config path to a deployed contract's reference name to the deployed
    // contract's address.
    mapping(string => mapping(string => mapping(bytes32 => address))) private deployed;

    IChugSplashUtils internal utils;

    // Get owner address
    uint private key = vm.envOr("CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address private systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string private rootPath =
        vm.envOr("DEV_FILE_PATH", string("./node_modules/@chugsplash/plugins/"));
    string private rootFfiPath = string(abi.encodePacked(rootPath, "dist/foundry/"));
    string internal mainFfiScriptPath = string(abi.encodePacked(rootFfiPath, "index.js"));

    modifier noVmBroadcast() {
        (VmSafe.CallerMode callerMode, , ) = vm.readCallers();
        require(callerMode != VmSafe.CallerMode.Broadcast, "Cannot call ChugSplash using vm.broadcast. Please use vm.startBroadcast instead.");
        _;
    }

    /**
     * @notice This constructor must not revert, or else an opaque error message will be displayed
       to the user.
     */
    constructor() {
        bytes memory creationCode = vm.getCode(string(abi.encodePacked(rootPath, "out/artifacts/ChugSplashUtils.sol/ChugSplashUtils.json")));
        address utilsAddr = address(0);
        assembly {
            utilsAddr := create(0, add(creationCode, 0x20), mload(creationCode))
        }
        utils = IChugSplashUtils(utilsAddr);
    }

    function silence() public {
        silent = true;
    }

    // This is the entry point for the ChugSplash deploy command.
    function deploy(string memory _configPath, string memory _projectName, string memory _rpcUrl) public {
        OptionalAddress memory newOwner;
        newOwner.exists = false;
        deploy(_configPath, _projectName, _rpcUrl, newOwner);
    }

    function initializeChugSplash(string memory _rpcUrl) internal {
        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        bool isRecurrentBroadcast = callerMode == VmSafe.CallerMode.RecurrentBroadcast;
        if (isRecurrentBroadcast) vm.stopBroadcast();
        (bool success, bytes memory retdata) = address(utils).delegatecall(abi.encodeWithSelector(IChugSplashUtils.initialize.selector, _rpcUrl, isRecurrentBroadcast, mainFfiScriptPath, systemOwnerAddress));
        require(success, string(utils.removeSelector(retdata)));
        if (isRecurrentBroadcast) vm.startBroadcast(msgSender);
    }

    function deploy(
        string memory _configPath,
        string memory _projectName,
        string memory _rpcUrl,
        OptionalAddress memory _newOwner
    ) private noVmBroadcast {
        initializeChugSplash(_rpcUrl);

        Configs memory configs = ffiGetConfigs(
            _configPath, _projectName
        );

        IChugSplashRegistry registry = utils.getChugSplashRegistry();
        IChugSplashManager manager = IChugSplashManager(payable(configs.minimalConfig.deployer));

        (bool success, bytes memory retdata) = address(utils).delegatecall(abi.encodeWithSelector(IChugSplashUtils.getConfigCache.selector, configs.minimalConfig, registry, manager, _rpcUrl, mainFfiScriptPath, executionLogs));
        require(success, string(utils.removeSelector(retdata)));
        ConfigCache memory configCache = abi.decode(retdata, (ConfigCache));

        BundleInfo memory bundleInfo = getBundleInfo(configCache, configs.userConfigStr);

        address signer = utils.msgSender();
        require(signer == configs.minimalConfig.owner, string(abi.encodePacked("The signer must match the 'owner' in the ChugSplash config.\n", "Signer: ", vm.toString(signer), "\n", "Owner: ", vm.toString(configs.minimalConfig.owner))));

        // Claim the project with the signer as the owner. Once we've completed the deployment, we'll
        // transfer ownership to the new owner specified by the user, if it exists.
        register(registry, manager, signer);

        if (bundleInfo.actionBundle.actions.length == 0 && bundleInfo.targetBundle.targets.length == 0) {
            console.log("Nothing to execute in this deployment. Exiting early.");
            return;
        }

        bytes32 deploymentId = utils.getDeploymentId(bundleInfo.actionBundle, bundleInfo.targetBundle, bundleInfo.configUri, configs.minimalConfig.projectName);
        DeploymentState memory deploymentState = manager.deployments(deploymentId);

        if (deploymentState.status == DeploymentStatus.CANCELLED) {
            revert(
                string(abi.encodePacked(
                    configs.minimalConfig.projectName,
                    " was previously cancelled on ",
                    configCache.networkName
                ))
            );
        }

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            (uint256 numImmutableContracts, ) = utils.getNumActions(bundleInfo.actionBundle.actions);
            manager.approve{ gas: 1000000 }(
                configs.minimalConfig.projectName,
                bundleInfo.actionBundle.root,
                bundleInfo.targetBundle.root,
                bundleInfo.actionBundle.actions.length,
                bundleInfo.targetBundle.targets.length,
                numImmutableContracts,
                bundleInfo.configUri,
                false
            );

            deploymentState.status = DeploymentStatus.APPROVED;
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED
        ) {
            bool executionSuccess = executeDeployment(
                manager,
                bundleInfo.actionBundle,
                bundleInfo.targetBundle,
                configCache.blockGasLimit,
                bundleInfo.deployContractCosts
            );

            if (!executionSuccess) {
                revert(
                    string(abi.encodePacked(
                        "ChugSplash: failed to execute ",
                        configs.minimalConfig.projectName,
                        "likely because one of the user's constructors reverted during the deployment."
                    ))
                );
            }
        }

        if (_newOwner.exists) {
            transferProjectOwnership(manager, _newOwner.value, signer);
        }

        updateDeploymentMapping(_configPath, configs.minimalConfig.contracts);

        if (!silent) {
            console.log("Success!");
            for (uint i = 0; i < configs.minimalConfig.contracts.length; i++) {
                MinimalContractConfig memory contractConfig = configs.minimalConfig.contracts[i];
                console.log(
                    string(abi.encodePacked(
                        contractConfig.referenceName,
                        ": ",
                        vm.toString(contractConfig.addr)
                    ))
                );
            }
        }
    }

    function getBundleInfo(ConfigCache memory _configCache, string memory _userConfigStr) private returns (BundleInfo memory) {
        (bool success, bytes memory retdata) = address(utils).delegatecall(abi.encodeWithSelector(IChugSplashUtils.ffiGetEncodedBundleInfo.selector, _configCache, _userConfigStr, rootFfiPath));
        require(success, string(utils.removeSelector(retdata)));
        bytes memory data = abi.decode(retdata, (bytes));
        return utils.decodeBundleInfo(data);
    }

    function register(
        IChugSplashRegistry _registry,
        IChugSplashManager _manager,
        address _newOwner
    ) private {
        if (!utils.isProjectRegistered(_registry, address(_manager))) {
            _registry.register{ gas: 1000000 }(
                _newOwner,
                0,
                new bytes(0)
            );
        } else {
            address existingOwner = IOwnable(address(_manager)).owner();
            if (existingOwner != _newOwner) {
                revert(
                    string(abi.encodePacked(
                        "ChugSplash: project already owned by: ",
                        vm.toString(existingOwner)
                    ))
                );
            }
        }
    }

    function transferProjectOwnership(IChugSplashManager _manager, address _newOwner, address _currOwner) private {
        if (_newOwner != _currOwner) {
            if (_newOwner == address(0)) {
                IOwnable(address(_manager)).renounceOwnership();
            } else {
                IOwnable(address(_manager)).transferOwnership(_newOwner);
            }
        }
    }

    function updateDeploymentMapping(
        string memory _configPath,
        MinimalContractConfig[] memory _contractConfigs
    ) private {
        for (uint i = 0; i < _contractConfigs.length; i++) {
            MinimalContractConfig memory contractConfig = _contractConfigs[i];
            deployed[_configPath][contractConfig.referenceName][
                contractConfig.userSaltHash
            ] = contractConfig.addr;
        }
    }

    // This function returns the user config string as a performance optimization. Reading
    // TypeScript user configs can be slow, so we read it once here and pass it in to
    // future FFI calls.
    function ffiGetConfigs(
        string memory _configPath,
        string memory _projectName
    ) internal returns (Configs memory) {
        string memory ffiScriptPath = string(abi.encodePacked(rootFfiPath, "get-configs.js"));

        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        // We use ts-node here to support TypeScript ChugSplash config files.
        cmds[1] = "ts-node";
        // Using SWC speeds up the process of transpiling TypeScript into JavaScript
        cmds[2] = "--swc";
        cmds[3] = ffiScriptPath;
        cmds[4] = _configPath;

        bytes memory result = vm.ffi(cmds);

        // The success boolean is the last 32 bytes of the result.
        bytes memory successBytes = utils.slice(result, result.length - 32, result.length);
        bool success = abi.decode(successBytes, (bool));

        bytes memory data = utils.slice(result, 0, result.length - 32);

        if (success) {
            (MinimalConfig memory minimalConfig, string memory userConfigStr) = abi.decode(
                result,
                (MinimalConfig, string)
            );
            return Configs(minimalConfig, userConfigStr);
        } else {
            (string memory errors, ) = abi.decode(data, (string, string));
            revert(errors);
        }
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName
    ) public view returns (address) {
        return getAddress(_configPath, _referenceName, bytes32(0));
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName,
        bytes32 userSaltHash
    ) public view returns (address) {
        address addr = deployed[_configPath][_referenceName][userSaltHash];

        require(
            utils.getCodeSize(addr) > 0,
            string(abi.encodePacked(
                "Could not find contract: ",
                _referenceName,
                " in ",
                _configPath,
                ". ",
                "Did you misspell the contract's reference name or forget to deploy the config?"
            ))
        );

        return addr;
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function executeBatchActions(
        BundledChugSplashAction[] memory actions,
        IChugSplashManager manager,
        uint bufferedGasLimit,
        DeployContractCost[] memory deployContractCosts
    ) private returns (DeploymentStatus) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = manager.activeDeploymentId();
        DeploymentState memory state = manager.deployments(activeDeploymentId);
        // Filter out actions that have already been executed
        uint length = 0;
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                length += 1;
            }
        }
        BundledChugSplashAction[] memory filteredActions = new BundledChugSplashAction[](length);
        uint filteredActionIndex = 0;
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                filteredActions[filteredActionIndex] = action;
                filteredActionIndex += 1;
            }
        }

        // Exit early if there are no actions to execute
        if (filteredActions.length == 0) {
            return state.status;
        }

        uint executed = 0;
        while (executed < filteredActions.length) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint batchSize = utils.findMaxBatchSize(
                utils.inefficientSlice(filteredActions, executed, filteredActions.length),
                bufferedGasLimit - ((bufferedGasLimit) * 20) / 100,
                deployContractCosts
            );
            BundledChugSplashAction[] memory batch = utils.inefficientSlice(
                filteredActions,
                executed,
                executed + batchSize
            );
            (
                RawChugSplashAction[] memory rawActions,
                uint256[] memory _actionIndexes,
                bytes32[][] memory _proofs
            ) = utils.disassembleActions(batch);
            manager.executeActions{ gas: bufferedGasLimit }(rawActions, _actionIndexes, _proofs);

            // Return early if the deployment failed
            state = manager.deployments(activeDeploymentId);
            if (state.status == DeploymentStatus.FAILED) {
                return state.status;
            }

            // Move to next batch if necessary
            executed += batchSize;
        }

        // Return the final status
        return state.status;
    }

    function executeDeployment(
        IChugSplashManager manager,
        ChugSplashActionBundle memory actionBundle,
        ChugSplashTargetBundle memory targetBundle,
        uint256 blockGasLimit,
        DeployContractCost[] memory deployContractCosts
    ) private returns (bool) {
        vm.recordLogs();

        // Get number of deploy contract and set state actions
        (BundledChugSplashAction[] memory deployContractActions, BundledChugSplashAction[] memory setStorageActions) = utils.getActionsByType(
            actionBundle
        );

        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        // Execute all the deploy contract actions and exit early if the deployment failed
        DeploymentStatus status = executeBatchActions(
            deployContractActions,
            manager,
            bufferedGasLimit,
            deployContractCosts
        );
        if (status == DeploymentStatus.FAILED) {
            return false;
        } else if (status == DeploymentStatus.COMPLETED) {
            return true;
        }

        // Dissemble the set storage actions
        ChugSplashTarget[] memory targets = new ChugSplashTarget[](
            targetBundle.targets.length
        );
        bytes32[][] memory proofs = new bytes32[][](targetBundle.targets.length);
        for (uint i = 0; i < targetBundle.targets.length; i++) {
            BundledChugSplashTarget memory target = targetBundle.targets[i];
            targets[i] = target.target;
            proofs[i] = target.siblings;
        }

        // Start the upgrade
        manager.initiateUpgrade{ gas: 1000000 }(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, manager, bufferedGasLimit, deployContractCosts);

        // Complete the upgrade
        manager.finalizeUpgrade{ gas: 1000000 }(targets, proofs);

        pushRecordedLogs();

        return true;
    }

    function pushRecordedLogs() private {
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint i = 0; i < logs.length; i++) {
            executionLogs.push(logs[i]);
        }
    }
}
