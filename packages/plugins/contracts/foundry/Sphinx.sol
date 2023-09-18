// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import "forge-std/console.sol";

import { VmSafe, Vm } from "forge-std/Vm.sol";
import { console } from "forge-std/console.sol";

import { SphinxActions } from "../SphinxActions.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { LocalSphinxManager } from "../LocalSphinxManager.sol";
import { DefaultCreate3 } from "@sphinx-labs/contracts/contracts/DefaultCreate3.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { IOwnable } from "@sphinx-labs/contracts/contracts/interfaces/IOwnable.sol";
import {
    DeploymentState,
    Version,
    DeploymentStatus,
    RawSphinxAction,
    SphinxActionType
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    BundledSphinxAction,
    SphinxTarget,
    BundledSphinxTarget,
    SphinxActionBundle,
    SphinxTargetBundle,
    FoundryConfig,
    Configs,
    BundleInfo,
    FoundryContractConfig,
    ConfigCache,
    OptionalAddress,
    HumanReadableAction,
    Network,
    SphinxAction,
    SphinxConfig
} from "./SphinxPluginTypes.sol";
import { ISphinxUtils } from "./interfaces/ISphinxUtils.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";

        // TODO: we may want to document the fact that broadcasting on anvil doesn't work exactly
        // broadcasting on live networks. in particular, on live networks, broadcasting only occurs
        // if the user specifies --broadcast, --rpc-url, and vm.startBroadcast (i think). on anvil,
        // it works if the user just does vm.startBroadcast without --broadcast. it also works on
        // the first run if the user doesn't include --rpc-url too, but it fails on subsequent runs
        // because the in-process state isn't updated with the deployment, whereas the node is.

abstract contract Sphinx is StdUtils, SphinxConstants {
   // TODO: open a ticket in foundry that the getMappingLength is broken

    // TODO(docs): above constructor: you shouldn't execute any state-changing transactions or deploy any contracts
    // inside this constructor b/c this will happen:
    // 1. do stuff in constructor
    // 2. user does `function run() { vm.createSelectFork(...); deploy(...); }`
    // 3. deploy(...) will fail b/c stuff in constructor wasn't executed in the new fork.
    // If you need to execute transactions/deploy contracts, do so in the sphinxDeploy modifier.

    // TODO: you should do this: "If we want, it'd be pretty easy to enforce that live network
    // deployments happen via npx sphinx deploy and not by running a forge script"

    // TODO: if you decide to use the fast deployment logic for anvil, you should probably
    // run the pre-diff simulation against the live network logic, since this'd help prevent
    // against bugs caused by different local and live logic.

    /**
     * @notice TODO(docs): the last 20 bytes of ...
     */
    SphinxActions private constant actions = SphinxActions(address(uint160(uint256(keccak256('sphinx.actions')) - 1)));

    /**
     * @notice Maps a CREATE3 salt to a boolean indicating whether the salt has already been used
     *         in this deployment. We use this mapping to ensure that the user attempts to deploy
     *         only one contract at a given CREATE3 address in a single deployment.
     */
    mapping(bytes32 => bool) private salts;

    bytes32[] private saltArray;

    /**
     * @notice Maps a call hash to the number of times the call hash was attempted to be deployed
     *         in this deployment. We use this to determine whether or not to skip function calls.
     */
    mapping(bytes32 => uint256) public callCount;

    bytes32[] private callHashArray;

    // TODO(docs): the difference between this and `actions` is that `actions` will skip
    // contracts that have already been deployed. this array includes skipped contracts.
    address[] private contracts;

    // TODO: is there anything we can remove from the SphinxAction struct?

    // TODO: update forge-std to 1.6.1 in all packages
    // TODO(md): forge-std needs to be 1.6.1







    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    VmSafe.Log[] private executionLogs;
    bool private initialized;

    // Maps a Sphinx config path to a deployed contract's reference name to the deployed
    // contract's address.
    mapping(string => mapping(string => address)) private deployed;

    ISphinxUtils internal sphinxUtils;

    // Get owner address
    uint private key = vm.envOr("SPHINX_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address private systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string private rootPath =
        vm.envOr("DEV_FILE_PATH", string("./node_modules/@sphinx-labs/plugins/"));
    string private rootFfiPath = string(abi.encodePacked(rootPath, "dist/foundry/"));
    string internal mainFfiScriptPath = string(abi.encodePacked(rootFfiPath, "index.js"));

    modifier noBroadcastOrPrank() {
        (VmSafe.CallerMode callerMode, , ) = vm.readCallers();
        require(
            callerMode != VmSafe.CallerMode.Broadcast,
            "Cannot call Sphinx using vm.broadcast. Please use vm.startBroadcast instead."
        );
        require(
            callerMode != VmSafe.CallerMode.Prank,
            "Cannot call Sphinx using vm.prank. Please use vm.startPrank instead."
        );
        _;
    }

    address internal immutable sphinxManager;
    constructor(SphinxConfig memory _sphinxConfig) {
        // Sort the owners in ascending order. This is required to calculate the address of the
        // SphinxAuth contract, which determines the CREATE3 addresses of the user's contracts.
        address[] memory sortedOwners = sortAddresses(_sphinxConfig.owners);

        bytes memory authData = abi.encode(sortedOwners, _sphinxConfig.threshold);
        bytes32 authSalt = keccak256(abi.encode(authData, _sphinxConfig.projectName));

        address auth = Create2.computeAddress(
                authSalt,
                authProxyInitCodeHash,
                authFactoryAddress
            );
        bytes32 sphinxManagerSalt = keccak256(abi.encode(auth, _sphinxConfig.projectName, hex""));
        sphinxManager = Create2.computeAddress(
                sphinxManagerSalt,
                managerProxyInitCodeHash,
                registryAddress
            );
    }

    /**
     * @notice This is the entry point for the Sphinx deploy command. It makes a few FFI calls to
     *         TypeScript logic that's shared with the Hardhat plugin. Note that this command must
     *         perform all read and write operations to the blockchain from within Solidity instead
     *         of using a provider object in TypeScript. Otherwise, an error will be thrown because
     *         we can't create a provider object for the in-process Anvil node from outside of
     *         Solidity.
     */
    function deploy(string memory _configPath, string memory _rpcUrl) public {
        OptionalAddress memory newOwner;
        newOwner.exists = false;
        deploy(_configPath, _rpcUrl, newOwner, false);
    }

    function deployVerbose(string memory _configPath, string memory _rpcUrl) internal {
        OptionalAddress memory newOwner;
        newOwner.exists = false;
        deploy(_configPath, _rpcUrl, newOwner, true);
    }

    function initializeSphinx(string memory _rpcUrl) internal {
        _rpcUrl;
        // TODO: mv all of this logic

        // Get the creation bytecode of the SphinxUtils contract. We load the creation code
        // directly from a JSON file instead of importing it into this contract because this
        // speeds up the compilation process of contracts that inherit from this contract.
        bytes memory utilsCreationCode = vm.getCode(
            string(abi.encodePacked(rootPath, "out/artifacts/SphinxUtils.sol/SphinxUtils.json"))
        );
        address utilsAddr;
        assembly {
            utilsAddr := create2(0, add(utilsCreationCode, 0x20), mload(utilsCreationCode), 0)
        }
        require(utilsAddr != address(0), "Sphinx: failed to deploy SphinxUtils contract");
        sphinxUtils = ISphinxUtils(utilsAddr);

        // TODO: check that the sphinx contracts are deployed, and throw an error if not.
    }

    function deploy(
        string memory _configPath,
        string memory _rpcUrl,
        OptionalAddress memory _newOwner,
        bool _verbose
    ) private {
        address owner = sphinxUtils.msgSender();

        Configs memory configs = ffiGetConfigs(_configPath, owner);

        ISphinxRegistry registry = sphinxUtils.getSphinxRegistry();
        ISphinxManager manager = ISphinxManager(payable(configs.minimalConfig.manager));

        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.getConfigCache.selector,
                configs.minimalConfig,
                registry,
                manager,
                _rpcUrl,
                mainFfiScriptPath
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
        ConfigCache memory configCache = abi.decode(retdata, (ConfigCache));

        BundleInfo memory bundleInfo = getBundleInfo(configCache, configs.parsedConfigStr);

        require(
            owner == configs.minimalConfig.owner,
            string(
                abi.encodePacked(
                    "The signer must match the 'owner' in the Sphinx config.\n",
                    "Signer: ",
                    vm.toString(owner),
                    "\n",
                    "Owner:",
                    vm.toString(configs.minimalConfig.owner)
                )
            )
        );

        // Claim the project with the signer as the owner. Once we've completed the deployment
        // we'll transfer ownership to the new owner specified by the user, if it exists.
        register(configs.minimalConfig.projectName, registry, manager, owner);

        if (
            bundleInfo.actionBundle.actions.length == 0 &&
            bundleInfo.targetBundle.targets.length == 0
        ) {
            // This string is used in the off-chain deploy task to detect whether or not a
            // deployment is empty. Make sure to update the deploy task if you change this log
            // message.
            console.log("Nothing to execute in this deployment. Exiting early.");
            return;
        }

        bytes32 deploymentId = sphinxUtils.getDeploymentId(
            bundleInfo.actionBundle,
            bundleInfo.targetBundle,
            bundleInfo.configUri
        );

        DeploymentState memory deploymentState = manager.deployments(deploymentId);

        if (deploymentState.status == DeploymentStatus.CANCELLED) {
            revert(
                string(
                    abi.encodePacked(
                        configs.minimalConfig.projectName,
                        " was previously cancelled."
                    )
                )
            );
        }

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            (uint256 numInitialActions, uint256 numSetStorageActions) = sphinxUtils.getNumActions(
                bundleInfo.actionBundle.actions
            );
            manager.approve{ gas: 1000000 }(
                bundleInfo.actionBundle.root,
                bundleInfo.targetBundle.root,
                numInitialActions,
                numSetStorageActions,
                bundleInfo.targetBundle.targets.length,
                bundleInfo.configUri,
                false
            );

            deploymentState.status = DeploymentStatus.APPROVED;
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED ||
            deploymentState.status == DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
        ) {
            (bool executionSuccess, HumanReadableAction memory readableAction) = executeDeployment(
                manager,
                bundleInfo,
                configCache.blockGasLimit
            );

            if (!executionSuccess) {
                bytes memory revertMessage = readableAction.actionType == SphinxActionType.CALL
                    ? abi.encodePacked(
                        "Sphinx: failed to execute ",
                        configs.minimalConfig.projectName,
                        " because the following post-deployment action reverted: ",
                        readableAction.reason
                    )
                    : abi.encodePacked(
                        "Sphinx: failed to execute ",
                        configs.minimalConfig.projectName,
                        " because the following deployment reverted: ",
                        readableAction.reason
                    );

                revert(string(revertMessage));
            }
        }

        if (_newOwner.exists) {
            transferProjectOwnership(manager, _newOwner.value, owner);
        }

        updateDeploymentMapping(_configPath, configs.minimalConfig.contracts);

        if (_verbose) {
            console.log("Success!");
            for (uint i = 0; i < configs.minimalConfig.contracts.length; i++) {
                FoundryContractConfig memory contractConfig = configs.minimalConfig.contracts[i];
                console.log(
                    string(
                        abi.encodePacked(
                            contractConfig.referenceName,
                            ": ",
                            vm.toString(contractConfig.addr)
                        )
                    )
                );
            }
        }
    }

    function getBundleInfo(
        ConfigCache memory _configCache,
        string memory _parsedConfigStr
    ) private returns (BundleInfo memory) {
        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.ffiGetEncodedBundleInfo.selector,
                _configCache,
                _parsedConfigStr,
                rootFfiPath
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
        bytes memory data = abi.decode(retdata, (bytes));
        return sphinxUtils.decodeBundleInfo(data);
    }

    function register(
        string memory _projectName,
        ISphinxRegistry _registry,
        ISphinxManager _manager,
        address _newOwner
    ) private {
        if (!_registry.isManagerDeployed(address(_manager))) {
            _registry.register{ gas: 1000000 }(_newOwner, _projectName, new bytes(0));
        } else {
            address existingOwner = IOwnable(address(_manager)).owner();
            if (existingOwner != _newOwner) {
                revert(
                    string(
                        abi.encodePacked(
                            "Sphinx: project already owned by: ",
                            vm.toString(existingOwner)
                        )
                    )
                );
            }
        }
    }

    function transferProjectOwnership(
        ISphinxManager _manager,
        address _newOwner,
        address _currOwner
    ) private {
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
        FoundryContractConfig[] memory _contractConfigs
    ) private {
        for (uint i = 0; i < _contractConfigs.length; i++) {
            FoundryContractConfig memory contractConfig = _contractConfigs[i];
            require(
                deployed[_configPath][contractConfig.referenceName] == address(0),
                "Sphinx: Attempted to overwrite a contract that was already deployed. Should never happen."
            );
            deployed[_configPath][contractConfig.referenceName] = contractConfig.addr;
        }
    }

    // This function returns the user config string as a performance optimization. Reading
    // TypeScript user configs can be slow, so we read it once here and pass it in to
    // future FFI calls.
    function ffiGetConfigs(
        string memory _configPath,
        address _owner
    ) internal returns (Configs memory) {
        string memory ffiScriptPath = string(abi.encodePacked(rootFfiPath, "get-configs.js"));

        string[] memory cmds = new string[](7);
        cmds[0] = "npx";
        // We use ts-node here to support TypeScript Sphinx config files.
        cmds[1] = "ts-node";
        // Using SWC speeds up the process of transpiling TypeScript into JavaScript
        cmds[2] = "--swc";
        cmds[3] = ffiScriptPath;
        cmds[4] = _configPath;
        cmds[5] = vm.toString(_owner);
        cmds[6] = vm.toString(block.chainid);

        bytes memory result = vm.ffi(cmds);

        // The success boolean is the last 32 bytes of the result.
        bytes memory successBytes = sphinxUtils.slice(result, result.length - 32, result.length);
        bool success = abi.decode(successBytes, (bool));
        bytes memory data = sphinxUtils.slice(result, 0, result.length - 32);

        if (success) {
            (FoundryConfig memory minimalConfig, string memory parsedConfigStr) = abi.decode(
                data,
                (FoundryConfig, string)
            );
            return Configs(minimalConfig, parsedConfigStr);
        } else {
            (string memory errors, ) = abi.decode(data, (string, string));
            revert(errors);
        }
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName
    ) public view returns (address) {
        address addr = deployed[_configPath][_referenceName];

        require(
            sphinxUtils.getCodeSize(addr) > 0,
            string(
                abi.encodePacked(
                    "Sphinx: Could not find contract: ",
                    _referenceName,
                    " in ",
                    _configPath,
                    ". ",
                    "Did you misspell the contract's reference name or forget to deploy the config?"
                )
            )
        );

        return addr;
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function executeBatchActions(
        BundledSphinxAction[] memory bundledActions,
        bool isSetStorageActionArray,
        ISphinxManager manager,
        uint bufferedGasLimit
    ) private returns (DeploymentStatus, uint) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = manager.activeDeploymentId();
        DeploymentState memory state = manager.deployments(activeDeploymentId);

        BundledSphinxAction[] memory filteredActions = sphinxUtils.removeExecutedActions(
            bundledActions,
            state.actionsExecuted
        );

        // We can return early if there are no actions to execute.
        if (filteredActions.length == 0) {
            return (state.status, 0);
        }

        uint executed = 0;
        while (executed < filteredActions.length) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint batchSize = sphinxUtils.findMaxBatchSize(
                sphinxUtils.inefficientSlice(filteredActions, executed, filteredActions.length),
                bufferedGasLimit - ((bufferedGasLimit) * 20) / 100
            );
            BundledSphinxAction[] memory batch = sphinxUtils.inefficientSlice(
                filteredActions,
                executed,
                executed + batchSize
            );
            (RawSphinxAction[] memory rawActions, bytes32[][] memory _proofs) = sphinxUtils
                .disassembleActions(batch);

            // Execute the batch of actions.
            if (isSetStorageActionArray) {
                manager.setStorage{ gas: bufferedGasLimit }(rawActions, _proofs);
            } else {
                vm.recordLogs();
                // manager.executeInitialActions{ gas: bufferedGasLimit }(rawActions, _proofs);
                (bool success, bytes memory result) = address(manager).call{
                    gas: bufferedGasLimit
                }(
                    abi.encodeWithSignature(
                        "executeInitialActions((uint8,uint256,bytes)[],bytes32[][])",
                        rawActions,
                        _proofs
                    )
                );
                if (!success) {
                    uint256 failureIndex;
                    assembly {
                        failureIndex := mload(add(result, 0x24))
                    }

                    return (DeploymentStatus.FAILED, failureIndex);
                }
            }

            // Return early if the deployment failed.
            state = manager.deployments(activeDeploymentId);
            if (state.status == DeploymentStatus.FAILED) {
                return (state.status, 0);
            }

            // Move to next batch if necessary
            executed += batchSize;
        }

        // Return the final deployment status
        return (state.status, 0);
    }

    function executeDeployment(
        ISphinxManager manager,
        BundleInfo memory bundleInfo,
        uint256 blockGasLimit
    ) private returns (bool, HumanReadableAction memory) {
        vm.recordLogs();

        (
            BundledSphinxAction[] memory initialActions,
            BundledSphinxAction[] memory setStorageActions
        ) = sphinxUtils.splitActions(bundleInfo.actionBundle.actions);

        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        // Execute all the deploy contract actions and exit early if the deployment failed
        (DeploymentStatus status, uint failedActionIndex) = executeBatchActions(
            initialActions,
            false,
            manager,
            bufferedGasLimit
        );
        if (status == DeploymentStatus.FAILED) {
            // Return with the relevant human readable action
            return (false, bundleInfo.humanReadableActions[failedActionIndex]);
        } else if (status == DeploymentStatus.COMPLETED) {
            return (true, HumanReadableAction("", 0, SphinxActionType.CALL));
        }

        // Dissemble the set storage actions
        SphinxTarget[] memory targets = new SphinxTarget[](bundleInfo.targetBundle.targets.length);
        bytes32[][] memory proofs = new bytes32[][](bundleInfo.targetBundle.targets.length);
        for (uint i = 0; i < bundleInfo.targetBundle.targets.length; i++) {
            BundledSphinxTarget memory target = bundleInfo.targetBundle.targets[i];
            targets[i] = target.target;
            proofs[i] = target.siblings;
        }

        // Start the upgrade
        manager.initiateUpgrade{ gas: 1000000 }(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, true, manager, bufferedGasLimit);

        // Complete the upgrade
        manager.finalizeUpgrade{ gas: 1000000 }(targets, proofs);

        pushRecordedLogs();

        return (true, HumanReadableAction("", 0, SphinxActionType.CALL));
    }

    function pushRecordedLogs() private {
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint i = 0; i < logs.length; i++) {
            executionLogs.push(logs[i]);
        }
    }

    // TODO(test): test the time difference between deploying hai on anvil using the fast approach
    // and the slow approach.

    // TODO: case: say we're forking a live network where the sphinxmanager exists. do you overwrite
    // it with the localSphinxManager? if so, i think the callNonces mapping will have a different
    // storage slot. if this isn't the case, you should think about how it'd be possible for the
    // user to run into a situation like this. e.g. perhaps they start off without a sphinxManager,
    // then broadcast a deployment, then try to deploy again.

    // TODO: case: the user calls `deploy(Network)` twice in a single `run()`. on the second deploy,
    // the "sphinxManager" should have updated values (e.g. callNonces mapping.

    // TODO(docs): the sphinxClient keeps a running count of the number of times a callHash has
    // been attempted in a single deployment.
    function incrementCallCount(bytes32 _callHash) external {
        callCount[_callHash] += 1;
        callHashArray.push(_callHash);
    }

    // TODO: the user needs to inherit this
    modifier sphinxDeploy {
        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        require(callerMode == VmSafe.CallerMode.None, "Sphinx: You must not have any active pranks or broadcasts when calling 'deploy(network)'.");

        vm.etch(sphinxManager, type(LocalSphinxManager).runtimeCode);
        deployCodeTo("SphinxActions.sol:SphinxActions", hex"", address(actions));

        actions.removeAllActions();
        delete contracts;

        for (uint256 i = 0; i < saltArray.length; i++) {
            salts[saltArray[i]] = false;
        }
        delete saltArray;
        for (uint256 i = 0; i < callHashArray.length; i++) {
            callCount[callHashArray[i]] = 0;
        }
        delete callHashArray;

        vm.startPrank(sphinxManager);
        _;
        vm.stopPrank();
        // For each contract deployed in this script, set its final runtime bytecode to its
        // actual bytecode instead of its client's bytecode. This ensures that the user will
        // be interacting with their exact contract after the deployment completes.
        for (uint i = 0; i < contracts.length; i++) {
            address create3Address = contracts[i]; // TODO(refactor): rename 'contracts' to 'sphinxCreate3Salts'
            // The implementation's address is the CREATE3 address minus one.
            address impl = address(uint160(create3Address) - 1);
            vm.etch(create3Address, impl.code);
        }

        // TODO(docs): we update the sphinxManager at the end of the deployment because this mimics
        // what happens on a live network (right?)
        for (uint256 i = 0; i < callHashArray.length; i++) {
            bytes32 callHash = callHashArray[i];
            LocalSphinxManager(sphinxManager).setCallNonce(callHash, callCount[callHash]);
        }
    }

    // TODO: is it weird that the user defines a deploy(network) function, but never a
    // deploy(network, rpcUrl) function, then they are asked to call a function they
    // haven't defined when broadcasting? consider rethinking the UX.

    function deploy(Network _network) public virtual;

    function deploy(Network _network, string memory _rpcUrl) internal {
        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        require(callerMode == VmSafe.CallerMode.RecurrentBroadcast, "Sphinx: You must call 'vm.startBroadcast' before running 'deploy(network, rpcUrl)'.");
        vm.stopBroadcast();
        this.deploy(_network);

        // TODO: use-cases:
        // - in-process anvil node
        // - forked node:
        //   * via --rpc-url
        //   * via vm.createSelectFork
        // - broadcasting onto anvil node
        // - broadcasting onto live network

        string[] memory inputs = new string[](7);
        inputs[0] = "cast";
        inputs[1] = "rpc";
        inputs[2] = "hardhat_setCode";
        inputs[3] = vm.toString(address(actions));
        inputs[4] = vm.toString(address(actions).code);
        inputs[5] = "--rpc-url";
        inputs[6] = _rpcUrl;
        vm.ffi(inputs);

        // TODO(docs): removes any actions that may have been added during previous deployments.
        delete inputs;
        inputs = new string[](9);
        inputs[0] = "cast";
        inputs[1] = "send";
        inputs[2] = vm.toString(address(actions));
        inputs[3] = vm.toString(SphinxActions.removeAllActions.selector);
        inputs[4] = "--rpc-url";
        inputs[5] = _rpcUrl;
        inputs[6] = "--unlocked";
        inputs[7] = "--from";
        inputs[8] = vm.toString(msgSender);
        vm.ffi(inputs);

        for (uint256 i = 0; i < actions.numActions(); i++) {
            SphinxAction memory action = actions.getAction(i);
            bytes memory data = abi.encodePacked(SphinxActions.addSphinxAction.selector, abi.encode(action));
            delete inputs;
            inputs = new string[](9);
            inputs[0] = "cast";
            inputs[1] = "send";
            inputs[2] = vm.toString(address(actions));
            inputs[3] = vm.toString(data);
            inputs[4] = "--rpc-url";
            inputs[5] = _rpcUrl;
            inputs[6] = "--unlocked";
            inputs[7] = "--from";
            inputs[8] = vm.toString(msgSender);
            vm.ffi(inputs);
        }

        // TODO: although we could do validation in typescript, this won't catch validation
        // errors that occur when on anvil (in-process or broadcasting).

        delete inputs;
        inputs = new string[](5);
        inputs[0] = "cast";
        inputs[1] = "rpc";
        inputs[2] = "hardhat_getAutomine";
        inputs[3] = "--rpc-url";
        inputs[4] = _rpcUrl;
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        // Will be 0 for an anvil or hardhat node, 1 otherwise
        if (result.exit_code == 0) {

            // TODO(docs): we don't use the vm.startBroadcast flow here

            // broadcast
            delete inputs;
            inputs = new string[](7);
            inputs[0] = "cast";
            inputs[1] = "rpc";
            inputs[2] = "hardhat_setCode";
            inputs[3] = vm.toString(sphinxManager);
            inputs[4] = vm.toString(type(LocalSphinxManager).runtimeCode);
            inputs[5] = "--rpc-url";
            inputs[6] = _rpcUrl;
            vm.ffi(inputs);

            for (uint256 i = 0; i < callHashArray.length; i++) {
                // broadcast
                bytes32 callHash = callHashArray[i];
                bytes memory callHashData = abi.encodePacked(LocalSphinxManager.setCallNonce.selector, abi.encode(callHash, callCount[callHash]));
                delete inputs;
                inputs = new string[](9);
                inputs[0] = "cast";
                inputs[1] = "send";
                inputs[2] = vm.toString(sphinxManager);
                inputs[3] = vm.toString(callHashData);
                inputs[4] = "--rpc-url";
                inputs[5] = _rpcUrl;
                inputs[6] = "--unlocked";
                inputs[7] = "--from";
                inputs[8] = vm.toString(msgSender);
                vm.ffi(inputs);
            }

            delete inputs;
            inputs = new string[](7);
            inputs[0] = "cast";
            inputs[1] = "rpc";
            inputs[2] = "hardhat_setCode";
            inputs[3] = vm.toString(sphinxManager);
            inputs[4] = vm.toString(type(LocalSphinxManager).runtimeCode);
            inputs[5] = "--rpc-url";
            inputs[6] = _rpcUrl;
            vm.ffi(inputs);

            for (uint256 i = 0; i < actions.numActions(); i++) {
                SphinxAction memory action = actions.getAction(i);
                if (action.actionType == SphinxActionType.CALL) {
                    (address to, bytes4 selector, bytes memory functionParams) = abi.decode(action.data, (address, bytes4, bytes));
                    bytes memory data = abi.encodePacked(selector, functionParams);
                    delete inputs;
                    inputs = new string[](9);
                    inputs[0] = "cast";
                    inputs[1] = "send";
                    inputs[2] = vm.toString(to);
                    inputs[3] = vm.toString(data);
                    inputs[4] = "--rpc-url";
                    inputs[5] = _rpcUrl;
                    inputs[6] = "--unlocked";
                    inputs[7] = "--from";
                    inputs[8] = vm.toString(msgSender);
                    vm.ffi(inputs);
                } else if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                    (bytes memory initCode, bytes memory constructorArgs, bytes32 salt, string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                    bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, salt));
                    bytes memory initCodeWithArgs = abi.encodePacked(initCode, constructorArgs);
                    bytes memory data = abi.encodePacked(DefaultCreate3.deploy.selector, abi.encode(sphinxCreate3Salt, initCodeWithArgs, 0));
                    delete inputs;
                    inputs = new string[](9);
                    inputs[0] = "cast";
                    inputs[1] = "send";
                    inputs[2] = vm.toString(sphinxManager);
                    inputs[3] = vm.toString(data);
                    inputs[4] = "--rpc-url";
                    inputs[5] = _rpcUrl;
                    inputs[6] = "--unlocked";
                    inputs[7] = "--from";
                    inputs[8] = vm.toString(msgSender);
                    vm.ffi(inputs);
                }
            }
            // We start the broadcast again at the very end of this function in case the user is
            // broadcasting transactions after this function is finished executing.
            vm.startBroadcast(msgSender);
            return;
        } else {
            vm.startBroadcast(msgSender);
            // TODO: live network
        }

    }

    // TODO: you should turn optimizer off in foundry.toml to ensure you don't get "stack too deep" error

    // TODO(refactor): prefix all error messages with "Sphinx", since errors in foundry
    // look like this:
    // Error:
    // SphinxClient: CREATE3 salt already used in this deployment. Please use a different 'salt' or 'referenceName'.


    // TODO: you should loosen the version of this file in case the user is using 0.7.x

    // TODO(refactor): we can probably use the localSphinxManager inside the `deploy(network)`
    // function

    // TODO(notes):
    // - I think we should prepend "sphinx" to the variable names in all of the clients to avoid
    //   collisions with user-defined variables. E.g. if a user has a function param called "salt"
    //   and the logic in the corresponding client contract has a variable named "salt", then this
    //   could result in unexpected behavior. I started to do this in these contracts but I don't
    //   think it's exhaustive.

    // TODO: you should check that the functions in Sphinx.sol don't conflict with functions
    // that the user defines in their config.

    // TODO: move this to SphinxUtils, or at least Sphinx.sol
    function sortAddresses(address[] memory _unsorted) internal pure returns (address[] memory) {
        address[] memory sorted = _unsorted;
        for (uint i = 0; i < sorted.length; i++) {
            for (uint j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    address temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        return sorted;
    }

    // TODO: benchmark performance between the live deployment flow and the `cast` flow when
    // broadcasting on anvil. after, discuss with ryan how we want to implement broadcasting
    // on anvil.

    // TODO: see if it'd be easy to estimate the gasused by each deployment and function call.
    // if so, you can remove the heuristics off-chain, and getEstDeploy...

    // TODO: the build info uses the real FQN, so i think you'll need to use them within the
    // contract too. make sure that FQNs work instead of the truncated FQNs in the solidity code,
    // then tell ryan.

    // TODO: mv
    function computeCreate3Address(address _deployer, bytes32 _salt) internal pure returns(address) {
        // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
        // library for details.
        bytes memory proxyBytecode = hex"67_36_3d_3d_37_36_3d_34_f0_3d_52_60_08_60_18_f3";

        address proxy = computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return computeCreateAddress(proxy, 1);
    }

    function requireAvailableCreate3Salt(
        bytes32 _sphinxCreate3Salt
    ) internal view {
        require(
            !salts[_sphinxCreate3Salt],
            "Sphinx: CREATE3 salt already used in this deployment. Please use a different 'salt' or 'referenceName'."
        );
    }

    // TODO(docs): copied from stdcheats; faster than loading in that entire contract.
    function deployCodeTo(string memory what, bytes memory args, address where) internal virtual {
        bytes memory creationCode = vm.getCode(what);
        vm.etch(where, abi.encodePacked(creationCode, args));
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(success, "StdCheats deployCodeTo(string,bytes,uint256,address): Failed to create runtime bytecode.");
        vm.etch(where, runtimeBytecode);
    }

    // TODO: the user currently inherits a bunch of functions/variables that shouldn't be exposed to
    // them. consider putting making the sphinx library contract a private var in the sphinx client,
    // just call into it. you should first check that this wouldn't mess up the fact that we need
    // to prank/use the sphinx manager for deployments and function calls.

    // TODO(test): define a constructor and function with the maximum number of allowed variables,
    // turn the optimizer off, and see if you get a stack too deep error.

    function addDeploymentAction(string memory _fullyQualifiedName, bytes memory _constructorArgs, bytes32 _create3Salt, bytes32 _userSalt, string memory _referenceName) internal {
        bytes memory initCode = vm.getCode(_fullyQualifiedName);
        LocalSphinxManager(sphinxManager).deploy(_create3Salt, abi.encodePacked(initCode, _constructorArgs), 0);
        bytes memory actionData = abi.encode(initCode, _constructorArgs, _userSalt, _referenceName);
        actions.addSphinxAction(SphinxAction({
            fullyQualifiedName: _fullyQualifiedName,
            actionType: SphinxActionType.DEPLOY_CONTRACT,
            data: actionData
        }));
    }

    function deployClientAndImpl(address _create3Address, bytes32 _create3Salt, string memory _clientPath) internal {
        // The implementation's address is the CREATE3 address minus one.
        address impl = address(uint160(address(_create3Address)) - 1);

        vm.etch(impl, _create3Address.code);
        deployCodeTo(_clientPath, abi.encode(sphinxManager, address(this), impl), _create3Address);

        salts[_create3Salt] = true;
        saltArray.push(_create3Salt);
        contracts.push(_create3Address);
    }
}
