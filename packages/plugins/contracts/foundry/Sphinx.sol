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

// TODO(parse): you should check that the user's manager version is correct. c/f ValidManagerVersion

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
     * @notice Maps a reference name to a boolean that will be `true` if the reference name has already been used in this deployment. This also ensures that a `CREATE3` salt is only used once in a single deployment, since the reference name is used to calculate the salt.
     */
    mapping(bytes32 => bool) private referenceNames;

    bytes32[] private referenceNameArray;

    /**
     * @notice Maps a call hash to the number of times the call hash was attempted to be deployed
     *         in this deployment. We use this to determine whether or not to skip function calls.
     */
    mapping(bytes32 => uint256) public callCount;

    bytes32[] private callHashArray;

    // TODO(docs): the difference between this and `actions` is that `actions` will skip
    // contracts that have already been deployed. this array includes skipped contracts.
    address[] private contracts;


    SphinxConfig private sphinxConfig;
    bytes private authData;

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

    address internal immutable sphinxManager;
    constructor(SphinxConfig memory _sphinxConfig) {
        sphinxConfig = _sphinxConfig;

        // Sort the owners in ascending order. This is required to calculate the address of the
        // SphinxAuth contract, which determines the CREATE3 addresses of the user's contracts.
        address[] memory sortedOwners = sortAddresses(_sphinxConfig.owners);

        authData = abi.encode(sortedOwners, _sphinxConfig.threshold);
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
        if (initialized) return;

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

        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.initialize.selector,
                _rpcUrl,
                callerMode == VmSafe.CallerMode.RecurrentBroadcast,
                mainFfiScriptPath,
                systemOwnerAddress
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
        initialized = true;
    }

    function deploy(
        Network _network,
        string memory _configPath,
        bool _verbose
    ) private {
        // TODO(parse): you can use the error message here. after that, rm.
        // require(
        //     owner == configs.minimalConfig.owner,
        //     string(
        //         abi.encodePacked(
        //             "The signer must match the 'owner' in the Sphinx config.\n",
        //             "Signer: ",
        //             vm.toString(owner),
        //             "\n",
        //             "Owner:",
        //             vm.toString(configs.minimalConfig.owner)
        //         )
        //     )
        // );

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

        // // Sign the meta-txn for the auth root, or leave it undefined if we're not relaying the proposal
        // // to the back-end.
        // // TODO: this should replace the current "empty config" check in Sphinx.sol
        // if (leafs.length === 0) {
        //   spinner.succeed(
        //     `Skipping proposal because your Sphinx config file has not changed.`
        //   )
        //   return { proposalRequest: undefined, ipfsData: undefined }
        // }
        // const metaTxnSignature =
        //   !dryRun && !signMetaTxn
        //     ? undefined
        //     : await signAuthRootMetaTxn(wallet, root)
        // if (
        //   firstProposalOccurred &&
        //   !prevConfig.options.proposers.includes(signerAddress)
        // ) {
        //   throw new Error(
        //     `Signer is not currently a proposer on chain ${chainId}. Signer's address: ${signerAddress}\n` +
        //       `Current proposers: ${prevConfig.options.proposers.map(
        //         (proposer) => `\n- ${proposer}`
        //       )}`
        //   )
        // }


        // TODO: if config.owners.length == 1 and proposers.length == 0, then make the owner a proposer.

        // TODO: do these checks before executing transactions:
        // 1. if `hasRole(signer, ownerRole)`
        // 2. if (firstProposalOccurred && hasRole(signer, proposerRole))
        // 3. if getRoleMemberCount == 1
        // address existingOwner = IOwnable(address(_manager)).owner();
        // if (existingOwner != _newOwner) {
        //     revert(
        //         string(
        //             abi.encodePacked(
        //                 "Sphinx: project already owned by: ",
        //                 vm.toString(existingOwner)
        //             )
        //         )
        //     );
        // }

        register(authData, sphinxConfig.projectName);

        // TODO: sign meta txn

        bytes32 deploymentId = sphinxUtils.getDeploymentId(
            bundleInfo.actionBundle,
            bundleInfo.targetBundle,
            bundleInfo.configUri
        );
        DeploymentState memory deploymentState = sphinxManager.deployments(deploymentId);

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
            sphinxManager.approve{ gas: 1000000 }(
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
                sphinxManager,
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
            transferProjectOwnership(sphinxManager, _newOwner.value, owner);
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
        SphinxAction[] memory _actions,
        ConfigCache memory _configCache
    ) private returns (BundleInfo memory) {
        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.ffiGetEncodedBundleInfo.selector,
                _actions,
                _configCache,
                rootFfiPath
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
        bytes memory data = abi.decode(retdata, (bytes));
        return sphinxUtils.decodeBundleInfo(data);
    }

    function register(
        bytes memory _authData,
        string memory _projectName
    ) private {
        SphinxAuthFactory authFactory = SphinxAuthFactory(authFactoryAddress);
        bytes32 authSalt = keccak256(abi.encode(_authData, _projectName));
        bool isRegistered = address(authFactory.auths(authSalt)) == address(0);
        if (!isRegistered) {
            authFactory.deploy{ gas: 2000000 }(_authData, hex"", _projectName);
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
    modifier sphinxDeploy(Network _network) {
        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        // TODO: ik there's a use case for 2 of the other 3 caller modes: no broadcast and
        // startBroadcast. is there a use case for startPrank? update this contract accordingly.
        (VmSafe.CallerMode callerMode, , ) = vm.readCallers();
        require(
            callerMode != VmSafe.CallerMode.Broadcast,
            "Cannot call Sphinx using vm.broadcast. Please use vm.startBroadcast instead."
        );
        require(
            callerMode != VmSafe.CallerMode.Prank,
            "Cannot call Sphinx using vm.prank. Please use vm.startPrank instead."
        );

        // TODO(docs): this is from the old plugin: Next, we deploy and initialize the Sphinx
        // contracts. If we're in a recurrent broadcast or prank, we temporarily stop it before we
        // initialize the contracts. We disable broadcasting because we can't call vm.etch from
        // within a broadcast. We disable pranking because we need to prank the owner of the Sphinx
        // contracts when initializing the Sphinx contracts.
        if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            vm.stopBroadcast();
            string memory rpcUrl = vm.rpcUrl(toString(_network));

            initializeSphinx(rpcUrl);

            // TODO: if broadcasting on a live network, you should check that the owners array is length 1
            // and that the owner matches this address (or CallerMode.msgSender if that works)
            address owner = sphinxUtils.msgSender();

        } else if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();

        vm.etch(sphinxManager, type(LocalSphinxManager).runtimeCode);
        deployCodeTo("SphinxActions.sol:SphinxActions", hex"", address(actions));

        actions.removeAllActions();
        delete contracts;

        for (uint256 i = 0; i < referenceNameArray.length; i++) {
            referenceNames[referenceNameArray[i]] = false;
        }
        delete referenceNameArray;
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

        if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            ISphinxRegistry registry = sphinxUtils.getSphinxRegistry();
            (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
                abi.encodeWithSelector(
                    ISphinxUtils.getConfigCache.selector,
                    registry,
                    manager
                )
            );
            require(success, string(sphinxUtils.removeSelector(retdata)));
            ConfigCache memory configCache = abi.decode(retdata, (ConfigCache));

            BundleInfo memory bundleInfo = getBundleInfo(actions.getAllActions(), configCache);
            vm.startBroadcast(msgSender);
        }
        else if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);
    }

    // TODO: is it weird that the user defines a deploy(network) function, but never a
    // deploy(network, rpcUrl) function, then they are asked to call a function they
    // haven't defined when broadcasting? consider rethinking the UX.

    function deploy(Network _network) public virtual;

    function deploy(Network _network, string memory _rpcUrl) internal {
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
                    (bytes memory initCode, bytes memory constructorArgs, bytes32 userSalt, string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                    bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
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

    function requireAvailableReferenceName(
        string memory _referenceName
    ) internal view {
        require(
            !referenceNames[_referenceName],
            string(
                "Sphinx: The reference name ",
                _referenceName,
                " was used more than once in this deployment. Reference names must be unique."
            )
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

    function addDeploymentAction(string memory _fullyQualifiedName, bytes memory _constructorArgs, bytes32 _create3Salt, bytes32 _userSalt, string memory _referenceName, bool _skip) internal {
        bytes memory initCode = vm.getCode(_fullyQualifiedName);
        LocalSphinxManager(sphinxManager).deploy(_create3Salt, abi.encodePacked(initCode, _constructorArgs), 0);
        bytes memory actionData = abi.encode(initCode, _constructorArgs, _userSalt, _referenceName);
        actions.addSphinxAction(SphinxAction({
            fullyQualifiedName: _fullyQualifiedName,
            actionType: SphinxActionType.DEPLOY_CONTRACT,
            data: actionData,
            skip: skip
        }));
    }

    function deployClientAndImpl(address _create3Address, string memory _referenceName, string memory _clientPath) internal {
        // The implementation's address is the CREATE3 address minus one.
        address impl = address(uint160(address(_create3Address)) - 1);

        vm.etch(impl, _create3Address.code);
        deployCodeTo(_clientPath, abi.encode(sphinxManager, address(this), impl), _create3Address);

        referenceNames[_referenceName] = true;
        referenceNameArray.push(_referenceName);
        contracts.push(_create3Address);
    }
}
