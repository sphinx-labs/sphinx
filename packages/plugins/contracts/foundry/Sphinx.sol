// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import "forge-std/console.sol";

import { VmSafe, Vm } from "forge-std/Vm.sol";
import { console } from "forge-std/console.sol";

import { ISemver } from "@sphinx-labs/contracts/contracts/interfaces/ISemver.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxAuthLibrary } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxAuthFactory } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import { IOwnable } from "@sphinx-labs/contracts/contracts/interfaces/IOwnable.sol";
import {
    DeploymentState,
    Version,
    DeploymentStatus,
    RawSphinxAction,
    SphinxActionType,
    AuthState,
    AuthLeafType
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    BundledSphinxAction,
    SphinxTarget,
    BundledSphinxTarget,
    SphinxActionBundle,
    SphinxTargetBundle,
    FoundryConfig,
    BundleInfo,
    FoundryContractConfig,
    OptionalAddress,
    HumanReadableAction,
    Network,
    SphinxAction,
    SphinxConfig,
    PreviousInfo,
    ChainInfo,
    BundledAuthLeaf
} from "./SphinxPluginTypes.sol";
import { ISphinxUtils } from "./interfaces/ISphinxUtils.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { SphinxContractInfo, SphinxConstants } from "./SphinxConstants.sol";

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

    // TODO(docs): answer the question, " why does the SphinxAction have so many things encoded in
    // the data field instead of stored as their own fields?"
    SphinxAction[] private actions;

    // TODO: i think we need to remove the initial state at the same time that we do
    // removeAllActions.

    ChainInfo private chainInfo;

    SphinxConfig private sphinxConfig;
    bytes private authData;

    // TODO: is there anything we can remove from the SphinxAction struct?

    // TODO(md): forge-std needs to be 1.6.1

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // TODO(docs): this is *not* deployed for the in-process deployment flow, which boosts
    // performance.
    ISphinxUtils internal sphinxUtils;

    // TODO(docs): we use a state variable here instead of vm.readCallers b/c we prank the
    // SphinxManager during the deployment process, which means vm.readCallers will always
    // return "RecurrentPrank".
    VmSafe.CallerMode public initialCallerMode;

    string private rpcUrl;
    bool private isLiveNetwork_;

    // Get owner address
    uint private key = vm.envOr("SPHINX_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address private systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string private rootPath =
        vm.envOr("DEV_FILE_PATH", string("./node_modules/@sphinx-labs/plugins/"));
    string private rootFfiPath = string(abi.encodePacked(rootPath, "dist/foundry/"));
    string internal mainFfiScriptPath = string(abi.encodePacked(rootFfiPath, "index.js"));

    ISphinxManager internal immutable manager;
    ISphinxAuthLibrary private immutable auth;
    PreviousInfo private prevInfo;

    // TODO: rm?
    // // TODO(docs): these values can be overridden by the user in their constructor.
    // // TODO(docs): these fields must be defined for every deployment.
    // string internal projectName;
	// address[] internal owners;
	// Version internal version;
    // // These fields must be defined if the user is using the DevOps platform.
    // string internal orgId;
	// address[] internal proposers;
	// Network[] internal mainnets;
	// Network[] internal testnets;
	// uint256 internal threshold;

    constructor(SphinxConfig memory _sphinxConfig) {
        sphinxConfig = _sphinxConfig;

        if (sphinxConfig.owners.length == 1 && sphinxConfig.proposers.length == 0) {
            sphinxConfig.proposers.push(sphinxConfig.owners[0]);
        }

        // Sort the owners in ascending order. This is required to calculate the address of the
        // SphinxAuth contract, which determines the CREATE3 addresses of the user's contracts.
        address[] memory sortedOwners = sortAddresses(sphinxConfig.owners);

        authData = abi.encode(sortedOwners, sphinxConfig.threshold);
        bytes32 authSalt = keccak256(abi.encode(authData, sphinxConfig.projectName));

        address authAddress = computeCreate2Address(
                authSalt,
                authProxyInitCodeHash,
                authFactoryAddress
            );
        auth = ISphinxAuthLibrary(authAddress);
        bytes32 sphinxManagerSalt = keccak256(abi.encode(authAddress, sphinxConfig.projectName, hex""));
        manager = ISphinxManager(computeCreate2Address(
                sphinxManagerSalt,
                managerProxyInitCodeHash,
                registryAddress
            ));
    }

    function initializeSphinx(string memory _rpcUrl) internal {
        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.initialize.selector,
                _rpcUrl,
                mainFfiScriptPath,
                systemOwnerAddress
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
    }

    // TODO: when you do the next contract upgrade:
    // 1. add an equivalent of manager.isExecuting() and/or activeBundleId in the SphinxAuth
    //     contract, then remove the `fetchCanonicalConfig` logic. consider the case where there's
    //     more than one active auth bundle. i think you'll want a "numActiveAuthBundles" instead of
    //     a boolean for this reason. after you do this, you should add a check in the propose
    //     function in solidity.


    // TODO(propose): make sure that we simulate the live network deployment at some point
    function propose(bool _testnets, string memory _chainInfoPath) external {
        Network[] memory networks = _testnets ? sphinxConfig.testnets : sphinxConfig.mainnets;

        // TODO(docs): these checks are specific to proposals because these arrays aren't used in the
        // standard deploy task, which occurs on one network at a time.
        require(networks.length > 0, string(abi.encodePacked("Sphinx: There must be at least one network in your ", _testnets ? "'testnets'" : "'mainnets", " array.")));
        require(sphinxConfig.proposers.length > 0, "Sphinx: There must be at least one proposer in your 'proposers' array.");
        require(bytes(sphinxConfig.orgId).length > 0, "Sphinx: Your 'orgId' cannot be an empty string. Please retrieve it from Sphinx's UI.");

        ChainInfo[] memory chainInfoArray = new ChainInfo[](networks.length);
        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];
            NetworkInfo memory networkInfo = getNetworkInfo(network);

            // TODO(docs): `vm.createSelectFork` sets the` `block.chainid` to the target chain (e.g.
            // 1 for ethereum mainnet).
            vm.createSelectFork(vm.rpcUrl(networkInfo.name));

            // TODO(docs): we enable broadcasting to simulate the live network deployment flow
            // within the `deploy` function. this doesn't actually broadcast the transactions onto
            // the live network unless the forge script is invoked with the `--broadcast` flag on
            // the CLI, which doesn't occur within Sphinx's proposal task.
            vm.startBroadcast(); // TODO: broadcast from the `PROPOSER_PRIVATE_KEY`? otherwise, mv the `vm.envOr('PROPOSER_PK)` check above into TS.
            deploy(network);
            vm.stopBroadcast();

            chainInfoArray[i] = chainInfo;
        }

        vm.writeFile(_chainInfoPath, vm.toString(abi.encode(chainInfoArray)));
    }

    // TODO: case: say a user wants to broadcast their deployment onto anvil, but there are
    // multiple owners. i don't think we currently support this.

    // TODO: if config.owners.length == 1 and proposers.length == 0, then make the owner a proposer.

    function getBundleInfo(
        ChainInfo memory _chainInfo
    ) private returns (BundleInfo memory) {
        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.ffiGetEncodedBundleInfo.selector,
                _chainInfo,
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
        ISphinxAuthFactory authFactory = ISphinxAuthFactory(authFactoryAddress);
        bytes32 authSalt = keccak256(abi.encode(_authData, _projectName));
        bool isRegistered = address(authFactory.auths(authSalt)) != address(0);
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

    /**
     * Helper function for executing a list of actions in batches.
     */
    function executeBatchActions(
        BundledSphinxAction[] memory bundledActions,
        bool isSetStorageActionArray,
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
                // manager.executeInitialActions{ gas: bufferedGasLimit }(rawActions, _proofs);
                // TODO(refactor): can we remove this low-level call in favor of the command above?
                // if not, we should document why.
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
        BundleInfo memory bundleInfo,
        uint256 blockGasLimit
    ) private returns (bool, HumanReadableAction memory) {
        (
            BundledSphinxAction[] memory initialActions,
            BundledSphinxAction[] memory setStorageActions
        ) = sphinxUtils.splitActions(bundleInfo.bundles.actionBundle.actions);

        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        // Execute all the deploy contract actions and exit early if the deployment failed
        (DeploymentStatus status, uint failedActionIndex) = executeBatchActions(
            initialActions,
            false,
            bufferedGasLimit
        );
        if (status == DeploymentStatus.FAILED) {
            // Return with the relevant human readable action
            return (false, bundleInfo.humanReadableActions[failedActionIndex]);
        } else if (status == DeploymentStatus.COMPLETED) {
            return (true, HumanReadableAction(0, uint256(uint8(SphinxActionType.CALL)), ""));
        }

        // Dissemble the set storage actions
        SphinxTarget[] memory targets = new SphinxTarget[](bundleInfo.bundles.targetBundle.targets.length);
        bytes32[][] memory proofs = new bytes32[][](bundleInfo.bundles.targetBundle.targets.length);
        for (uint i = 0; i < bundleInfo.bundles.targetBundle.targets.length; i++) {
            BundledSphinxTarget memory target = bundleInfo.bundles.targetBundle.targets[i];
            targets[i] = target.target;
            proofs[i] = target.siblings;
        }

        // Start the upgrade
        manager.initiateUpgrade{ gas: 1000000 }(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, true, bufferedGasLimit);

        // Complete the upgrade
        manager.finalizeUpgrade{ gas: 1000000 }(targets, proofs);

        return (true, HumanReadableAction(0, uint256(uint8(SphinxActionType.CALL)), ""));
    }

    // TODO(test): test the time difference between deploying hai on anvil using the fast approach
    // and the slow approach.

    // TODO: case: the user calls `deploy(Network)` twice in a single `run()` on the in-process anvil node. on the second deploy,
    // the "sphinxManager" should have updated values (e.g. callNonces mapping.

    /**
     * @notice Returns the number of times a call hash has been attempted in this deployment.
     */
    function getCallCountInDeployment(bytes32 _callHash) public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < actions.length; i++) {
            SphinxAction memory action = actions[i];
            if (action.actionType == SphinxActionType.CALL) {
                (address to, bytes4 selector, bytes memory functionArgs, , ) = abi.decode(action.data, (address, bytes4, bytes, uint256, string));
                bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
                bytes32 callHash = keccak256(abi.encode(to, encodedCall));
                if (callHash == _callHash) {
                    count += 1;
                }
            }
        }
        return count;
    }

    // TODO: What should be the expected behavior if you call deploy(optimism) and then call deploy(arbitrum) in the same script?

    // TODO: the user needs to inherit this modifier.
    modifier sphinxDeploy(Network _network) {
        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        initialCallerMode = callerMode;

        require(
            callerMode != VmSafe.CallerMode.Broadcast,
            "Sphinx: Cannot call Sphinx using vm.broadcast. Please use vm.startBroadcast instead."
        );
        require(
            callerMode != VmSafe.CallerMode.Prank,
            "Sphinx: Cannot call Sphinx using vm.prank. Please use vm.startPrank instead."
        );

        // TODO(docs): we allow startPrank so that users don't need to toggle it when calling
        // `deploy`. however, we turn it off at the beginning of this modifier because we
        // prank the SphinxManager, which deploys the contracts. we toggle it back on at the
        // end of this modifier.
        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();
        else if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            vm.stopBroadcast();

            // Get the creation bytecode of the SphinxUtils contract. We only load this when the
            // user is broadcasting because it's not necessary for deployments on the in-process
            // node, which speeds up that deployment process. We load the creation code directly
            // from a JSON file instead of importing it into this contract because this speeds up
            // the compilation process of contracts that inherit from this contract.
            bytes memory utilsCreationCode = vm.getCode(
                string(abi.encodePacked(rootPath, "out/artifacts/SphinxUtils.sol/SphinxUtils.json"))
            );
            address utilsAddr;
            assembly {
                utilsAddr := create2(0, add(utilsCreationCode, 0x20), mload(utilsCreationCode), 0)
            }
            require(utilsAddr != address(0), "Sphinx: failed to deploy SphinxUtils contract");
            sphinxUtils = ISphinxUtils(utilsAddr);

            // TODO(refactor): maybe these should be in an "initial state" struct or something?
            // would probably be clearer. Also, this is only needed for the broadcast flow, but it's
            // defined globally, which isn't ideal. same with sphinxUtils, rpcUrl, isLiveNetwork_,
            // chainInfo (not actions), and probably other variables too.
            prevInfo = getPrevConfig();

            rpcUrl = vm.rpcUrl(getNetworkInfo(_network).name);
            isLiveNetwork_ = isLiveNetwork(rpcUrl);
        }

        validateTODO(_network);

        // TODO(docs): this is from the old plugin: Next, we deploy and initialize the Sphinx
        // contracts. If we're in a recurrent broadcast or prank, we temporarily stop it before we
        // initialize the contracts. We disable broadcasting because we can't call vm.etch from
        // within a broadcast. We disable pranking because we need to prank the owner of the Sphinx
        // contracts when initializing the Sphinx contracts.
        if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            if (isLiveNetwork_) {
                liveNetworkValidation(msgSender);
            }

            initializeSphinx(rpcUrl);

        }

        // TODO(docs): if we call this when broadcasting, the `authFactory.register` call will throw
        // an error b/c the sphinxmanager already exists.
        if (callerMode == VmSafe.CallerMode.None) {
            sphinxDeployManagerTo(address(manager));
        }

        delete actions;

        // TODO: should you delete any of the other fields in ChainInfo?

        vm.startPrank(address(manager));
        _;
        vm.stopPrank();

        // TODO(refactor): i don't like that there's an isBroadcast variable but we don't use it in this modifier.
        // you set isBroadcast at the very beginning of the modifier and use it throughout.

        for (uint i = 0; i < actions.length; i++) {
            // TODO: do you need to do the DEPLOY_CONTRACT stuff for both deployment flows?
            SphinxAction memory action = actions[i];
            // Set the contract's final runtime bytecode to its actual bytecode instead of its
            // client's bytecode. This ensures that the user will be interacting with their exact
            // contract after the deployment completes.
            // TODO(docs): we do this even if the contract deployment was skipped because a client
            // is used regardless.
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , bytes32 userSalt, string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
                address create3Address = computeCreate3Address(address(manager), sphinxCreate3Salt);
                // The implementation's address is the CREATE3 address minus one.
                address impl = address(uint160(create3Address) - 1);
                vm.etch(create3Address, impl.code);
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (address to, ) = abi.decode(action.data, (address, string));
                // The implementation's address is the current address minus one.
                address impl = address(uint160(address(to)) - 1);
                vm.etch(address(to), impl.code);
            } else if (action.actionType == SphinxActionType.CALL && callerMode == VmSafe.CallerMode.None) {
                // TODO(docs): we update the sphinxManager at the end of the deployment because this
                // mimics what happens on a live network.
                (address to, bytes4 selector, bytes memory functionArgs, , ) = abi.decode(action.data, (address, bytes4, bytes, uint256, string));
                bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
                bytes32 callHash = keccak256(abi.encode(to, encodedCall));
                bytes32 mappingValueSlotKey = getMappingValueSlotKey(callNoncesSlotKey, callHash);
                vm.store(address(manager), mappingValueSlotKey, bytes32(getCallCountInDeployment(callHash)));
            }
        }

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);
        else if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            setChainInfo(
                isLiveNetwork_, prevInfo, sphinxConfig
            );
            // TODO(refactor): it may be cleaner to invoke this in its own function exactly like we
            // do with proposals. if you need to keep this here, then consider renaming this env var
            // to something that mentions it's specifically for the deploy function.
            if (vm.envOr("SPHINX_INTERNAL__PREVIEW_ENABLED", false)) {

                // TODO(fix): This will not get output if the users script does not call the deploy function with a
                // broadcast which can cause errors or cause the preview to be incorrect in the deploy task.
                // We should probably think about if we can rework the deploy task such that there is no requirement to
                // provide an implemented run function. Or we should make it super easy to implement the run function.
                // I.e provide some utility function that you can just call from your run function.
                vm.writeFile(vm.envString("SPHINX_INTERNAL__CHAIN_INFO_PATH"), vm.toString(abi.encode(chainInfo)));
            }

            ISphinxRegistry registry = sphinxUtils.getSphinxRegistry();
            BundleInfo memory bundleInfo = getBundleInfo(chainInfo);

            if (bundleInfo.bundles.authBundle.leafs.length == 0) {
                console.log("Nothing to execute in this deployment. Exiting early.");
                return;
            }

            vm.startBroadcast(msgSender);

            register(authData, sphinxConfig.projectName);

            bytes32 deploymentId = sphinxUtils.getDeploymentId(
                bundleInfo.bundles.actionBundle,
                bundleInfo.bundles.targetBundle,
                bundleInfo.configUri
            );
            DeploymentState memory deploymentState = manager.deployments(deploymentId);

            require(deploymentState.status != DeploymentStatus.CANCELLED, "Sphinx: Deployment was previously cancelled. Exiting early.");
            require(deploymentState.status != DeploymentStatus.FAILED, "Sphinx: Deployment previously failed. Exiting early.");
            if (deploymentState.status == DeploymentStatus.COMPLETED) {
                console.log('Sphinx: Deployment was already completed. Exiting early.');
            }

            if (deploymentState.status == DeploymentStatus.EMPTY) {
                bytes memory authRootSignature = signMetaTxnForAuthRoot(vm.envUint("PRIVATE_KEY"), bundleInfo.bundles.authBundle.root);
                bytes[] memory signatureArray = new bytes[](1);
                signatureArray[0] = authRootSignature;
                (, uint256 leafsExecuted, ) = auth.authStates(bundleInfo.bundles.authBundle.root);
                for (uint i = 0; i < bundleInfo.bundles.authBundle.leafs.length; i++) {
                    BundledAuthLeaf memory leaf = bundleInfo.bundles.authBundle.leafs[i];

                    // TODO: check that the auth leafs are sorted according to their 'index' field. this
                    // logic will break otherwise.

                    if (leafsExecuted > leaf.leaf.index) {
                        continue;
                    }

                    if (leaf.leafType == AuthLeafType.SETUP) {
                        auth.setup{ gas: 1000000 }(
                            bundleInfo.bundles.authBundle.root,
                            leaf.leaf,
                            signatureArray,
                            leaf.proof
                        );
                    } else if (leaf.leafType == AuthLeafType.PROPOSE) {
                        auth.propose{ gas: 1000000 }(
                            bundleInfo.bundles.authBundle.root,
                            leaf.leaf,
                            signatureArray,
                            leaf.proof
                        );
                    }  else if (leaf.leafType == AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL) {
                        auth.upgradeManagerAndAuthImpl{ gas: 1000000 }(
                            bundleInfo.bundles.authBundle.root,
                            leaf.leaf,
                            signatureArray,
                            leaf.proof
                        );
                    }  else if (leaf.leafType == AuthLeafType.APPROVE_DEPLOYMENT) {
                        auth.approveDeployment{ gas: 1000000 }(
                            bundleInfo.bundles.authBundle.root,
                            leaf.leaf,
                            signatureArray,
                            leaf.proof
                        );
                    } else if (leaf.leafType == AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT) {
                        auth.cancelActiveDeployment{ gas: 1000000 }(
                            bundleInfo.bundles.authBundle.root,
                            leaf.leaf,
                            signatureArray,
                            leaf.proof
                        );
                    } else {
                        revert('Sphinx: Unsupported auth leaf type. Should never happen. Please report this to the developers.');
                    }
                }
                deploymentState.status = DeploymentStatus.APPROVED;
            }

            if (
                deploymentState.status == DeploymentStatus.APPROVED ||
                deploymentState.status == DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
                deploymentState.status == DeploymentStatus.PROXIES_INITIATED ||
                deploymentState.status == DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
            ) {
                (bool executionSuccess, HumanReadableAction memory readableAction) = executeDeployment(
                    bundleInfo,
                    block.gaslimit
                );

                if (!executionSuccess) {
                    bytes memory revertMessage = abi.encodePacked(
                            "Sphinx: failed to execute deployment because the following action reverted: ",
                            readableAction.reason);

                    revert(string(revertMessage));
                }
            }
        }
    }

    // TODO: is it weird that the user defines a deploy(network) function, but never a
    // deploy(network, rpcUrl) function, then they are asked to call a function they
    // haven't defined when broadcasting? consider rethinking the UX.

    function deploy(Network _network) public virtual;

    // TODO: use-cases:
    // - in-process anvil node
    // - forked node:
    //   * via --rpc-url
    //   * via vm.createSelectFork
    // - broadcasting onto anvil node
    // - broadcasting onto live network

    // TODO: you should turn optimizer off in foundry.toml to ensure you don't get "stack too deep" error

    // TODO(refactor): prefix all error messages with "Sphinx", since errors in foundry
    // look like this:
    // Error:
    // SphinxClient: CREATE3 salt already used in this deployment. Please use a different 'salt' or 'referenceName'.
    // Ryan - addressed

    // TODO: you should loosen the version of this file in case the user is using 0.7.x

    // TODO(notes):
    // - I think we should prepend "sphinx" to the variable names in all of the clients to avoid
    //   collisions with user-defined variables. E.g. if a user has a function param called "salt"
    //   and the logic in the corresponding client contract has a variable named "salt", then this
    //   could result in unexpected behavior. I started to do this in these contracts but I don't
    //   think it's exhaustive.
    // Ryan - Addressed in client generation by prepending `sphinxInternal` to all possibly conflicting
    //        variable names.

    // TODO: you should check that the functions in Sphinx.sol don't conflict with functions
    // that the user defines in their config.

    // TODO: the user currently inherits a bunch of functions/variables that shouldn't be exposed to
    // them. consider putting making the sphinx library contract a private var in the sphinx client,
    // just call into it. you should first check that this wouldn't mess up the fact that we need
    // to prank/use the sphinx manager for deployments and function calls.

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

    // TODO: see if it'd be easy to estimate the gasused by each deployment and function call.
    // if so, you can remove the heuristics off-chain, and getEstDeploy...

    // TODO: the build info uses the real FQN, so i think you'll need to use them within the
    // contract too. make sure that FQNs work instead of the truncated FQNs in the solidity code,
    // then tell ryan.

    // TODO: mv
    function computeCreate3Address(
        address _deployer,
        bytes32 _salt
    ) internal pure returns (address) {
        // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
        // library for details.
        bytes memory proxyBytecode = hex"67_36_3d_3d_37_36_3d_34_f0_3d_52_60_08_60_18_f3";

        address proxy = computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return computeCreateAddress(proxy, 1);
    }

    /**
     * @notice Deploys the SphinxManager contract to the target address.
     *         We use a dedicated function for this b/c we need to do it using the raw bytes imported from
     *         SphinxConstants.sol to avoid importing the manager itself and its entire dependency tree.
     */
    function sphinxDeployManagerTo(address where) internal {
        SphinxContractInfo[] memory contracts = getSphinxContractInfo();
        bytes memory managerCreationCodeWithArgs = contracts[1].creationCode;
        vm.etch(where, managerCreationCodeWithArgs);
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(
            success,
            "Sphinx: Failed to create runtime bytecode."
        );
        vm.etch(where, runtimeBytecode);
    }

    /**
     * @notice Deploys a contract with the specified qualified name and arguments to the target address.
     *         This function is also provided by foundry via stdcheats, but we reimplement it ourselves to
     *         avoid loading the entire contract.
     *
     * @param what The contract to deploy. Must be the qualified name or the path to the contracts artifact.
     *             Details: https://book.getfoundry.sh/cheatcodes/get-code?highlight=getCode#getcode
     * @param args The constructor arguments for the contract.
     * @param where The address to deploy the contract too.
     */
    function sphinxDeployCodeTo(string memory what, bytes memory args, address where) internal {
        bytes memory creationCode = vm.getCode(what);
        vm.etch(where, abi.encodePacked(creationCode, args));
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(
            success,
            "Sphinx: Failed to create runtime bytecode."
        );
        vm.etch(where, runtimeBytecode);
    }

    // TODO(mv): pasted from SphinxAuth contract
    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name)");
    bytes32 private constant DOMAIN_NAME_HASH = keccak256(bytes("Sphinx"));
    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(abi.encode(DOMAIN_TYPE_HASH, DOMAIN_NAME_HASH));
    bytes32 private constant TYPE_HASH = keccak256("AuthRoot(bytes32 root)");

    function signMetaTxnForAuthRoot(uint256 _privateKey, bytes32 _authRoot) private pure returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(TYPE_HASH, _authRoot));
        bytes32 typedDataHash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, typedDataHash);
        return abi.encodePacked(r, s, v);
    }

    function validateTODO(Network _network) private view {
        // TODO(docs): these should be validated whether the deployment is occurring locally, broadcasting on live network, etc.
        require(bytes(sphinxConfig.projectName).length > 0, "Sphinx: Your 'projectName' field cannot be empty.");
        require(sphinxConfig.owners.length > 0, "Sphinx: Your 'owners' array cannot be empty.");
        require(sphinxConfig.version.major == major && sphinxConfig.version.minor == minor &&
            sphinxConfig.version.patch == patch, string(abi.encodePacked(
            "Sphinx: Your 'version' field must be ",
            vm.toString(major),
            ".",
            vm.toString(minor),
            ".",
            vm.toString(patch),
            "."
        )));
        require(sphinxConfig.threshold > 0, "Sphinx: Your 'threshold' field must be greater than 0.");
        require(sphinxConfig.owners.length >= sphinxConfig.threshold, "Sphinx: Your 'threshold' field must be less than or equal to the number of owners in your 'owners' array.");

        address[] memory duplicateOwners = deduplicateElements(sphinxConfig.owners);
        address[] memory duplicateProposers = deduplicateElements(sphinxConfig.proposers);
        Network[] memory duplicateMainnets = deduplicateElements(sphinxConfig.mainnets);
        Network[] memory duplicateTestnets = deduplicateElements(sphinxConfig.testnets);
        require(duplicateOwners.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'owners' array contains duplicate addresses: ",
            toString(duplicateOwners)
        )));
        require(duplicateProposers.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'proposers' array contains duplicate addresses: ",
            toString(duplicateProposers)
        )));
        require(duplicateMainnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'mainnets' array contains duplicate networks: ",
            toString(duplicateMainnets)
        )));
        require(duplicateTestnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'testnets' array contains duplicate networks: ",
            toString(duplicateTestnets)
        )));

        Network[] memory invalidMainnets = removeNetworkType(sphinxConfig.mainnets, NetworkType.Mainnet);
        require(invalidMainnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'mainnets' array contains non-production networks: ",
            toString(invalidMainnets)
        )));
        Network[] memory invalidTestnets = removeNetworkType(sphinxConfig.testnets, NetworkType.Testnet);
        require(invalidTestnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'testnets' array contains invalid test networks: ",
            toString(invalidTestnets)
        )));

        require(block.chainid == getNetworkInfo(_network).chainId, string(abi.encodePacked("Sphinx: The 'block.chainid' does not match the chain ID of the network: ", getNetworkInfo(_network).name)));
    }

    function liveNetworkValidation(address _msgSender) private {
            require(sphinxConfig.owners.length == 1, "Sphinx: You can only deploy on a live network if there is only one owner in your 'owners' array.");
            // TODO(parse): you should check that the key corresponding to PRIVATE_KEY matches
            // CallerMode.msgSender. i don't think we currently do this.

            address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
            require(_msgSender == deployer, string(abi.encodePacked("Sphinx: You must call 'vm.startBroadcast' with the address corresponding to the 'PRIVATE_KEY' in your '.env' file.",
                "Broadcast address: ",
                vm.toString(_msgSender),
                "\n",
                "Address corresponding to private key: ",
                vm.toString(deployer)
            )));
            require(
                deployer == sphinxConfig.owners[0],
                string(
                    abi.encodePacked(
                        "Sphinx: The deployer must match the owner in the 'owners' array.\n",
                        "Deployer: ",
                        vm.toString(deployer),
                        "\n",
                        "Owner: ",
                        vm.toString(sphinxConfig.owners[0])
                    )
                )
            );

            if (address(auth).code.length > 0) {
                // Check that the deployer is an owner. 0x00 is the `DEFAULT_ADMIN_ROLE` used
                // by OpenZeppelin's AccessControl contract.
                require(auth.hasRole(0x00, deployer), "Sphinx: The deployer must be an owner of the SphinxAuth contract.");
                require(auth.getRoleMemberCount(0x00) == 1, "Sphinx: The deployer must be the only owner of the SphinxAuth contract.");
                require(!prevInfo.firstProposalOccurred || auth.hasRole(keccak256("ProposerRole"), deployer), "Sphinx: The deployer must be a proposer in the SphinxAuth contract.");
            }

            // TODO(docs):
            string[] memory inputs = new string[](5);
            inputs[0] = "cast";
            inputs[1] = "rpc";
            inputs[2] = "eth_chainId";
            inputs[3] = "--rpc-url";
            inputs[4] = rpcUrl;
            Vm.FfiResult memory result = vm.tryFfi(inputs);
            require(result.exit_code == 0, string(abi.encodePacked("Sphinx: The RPC URL ", rpcUrl, " is invalid.\nIf this is an Anvil node, make sure that it's running.")));
    }

    // TODO(refactor): i think you can enforce that the user is using the sphinxDeploy modifier by
    // having a private variable in Sphinx.sol that's only set to true inside the modifier. then,
    // you'd just have an assertion at the beginning of the deploy functoin that checks that the
    // variable is true. if you do this, you should set it to false at the end of the modifier.

    function toString(Network[] memory _network) private pure returns (string memory) {
        string memory result = "\n";
        for (uint i = 0; i < _network.length; i++) {
            result = string.concat(result, getNetworkInfo(_network[i]).name);
            if (i != _network.length - 1) {
                result = string.concat(result, "\n");
            }
        }
        result = string.concat(result);
        return result;
    }

    enum NetworkType {
        Mainnet,
        Testnet,
        Local
    }

    struct NetworkInfo {
        string name;
        uint chainId;
        NetworkType networkType;
    }

    function getNetworkInfo(Network _network) private pure returns (NetworkInfo memory) {
        if (_network == Network.anvil) return NetworkInfo({
            name: "anvil",
            chainId: 31337,
            networkType: NetworkType.Local
        });
        if (_network == Network.ethereum) return NetworkInfo({
            name: "ethereum",
            chainId: 1,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.optimism) return NetworkInfo({
            name: "optimism",
            chainId: 10,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.arbitrum) return NetworkInfo({
            name: "arbitrum",
            chainId: 42161,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.polygon) return NetworkInfo({
            name: "polygon",
            chainId: 137,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.bnb) return NetworkInfo({
            name: "bnb",
            chainId: 56,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.gnosis) return NetworkInfo({
            name: "gnosis",
            chainId: 100,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.linea) return NetworkInfo({
            name: "linea",
            chainId: 59144,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.polygon_zkevm) return NetworkInfo({
            name: "polygon_zkevm",
            chainId: 1101,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.avalanche) return NetworkInfo({
            name: "avalanche",
            chainId: 43114,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.fantom) return NetworkInfo({
            name: "fantom",
            chainId: 250,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.base) return NetworkInfo({
            name: "base",
            chainId: 8453,
            networkType: NetworkType.Mainnet
        });
        if (_network == Network.goerli) return NetworkInfo({
            name: "goerli",
            chainId: 5,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.optimism_goerli) return NetworkInfo({
            name: "optimism_goerli",
            chainId: 420,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.arbitrum_goerli) return NetworkInfo({
            name: "arbitrum_goerli",
            chainId: 421613,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.polygon_mumbai) return NetworkInfo({
            name: "polygon_mumbai",
            chainId: 80001,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.bnb_testnet) return NetworkInfo({
            name: "bnb_testnet",
            chainId: 97,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.gnosis_chiado) return NetworkInfo({
            name: "gnosis_chiado",
            chainId: 10200,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.linea_goerli) return NetworkInfo({
            name: "linea_goerli",
            chainId: 59140,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.polygon_zkevm_goerli) return NetworkInfo({
            name: "polygon_zkevm_goerli",
            chainId: 1442,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.avalanche_fuji) return NetworkInfo({
            name: "avalanche_fuji",
            chainId: 43113,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.fantom_testnet) return NetworkInfo({
            name: "fantom_testnet",
            chainId: 4002,
            networkType: NetworkType.Testnet
        });
        if (_network == Network.base_goerli) return NetworkInfo({
            name: "base_goerli",
            chainId: 84531,
            networkType: NetworkType.Testnet
        });
        revert("Sphinx: Invalid network.");
    }

    function removeNetworkType(Network[] memory _networks, NetworkType _networkType) private pure returns (Network[] memory) {
        Network[] memory notNetworkType = new Network[](_networks.length);
        uint numNotNetworkType = 0;
        for (uint i = 0; i < _networks.length; i++) {
            if (getNetworkInfo(_networks[i]).networkType != _networkType) {
                notNetworkType[numNotNetworkType] = _networks[i];
                numNotNetworkType++;
            }
        }
        Network[] memory trimmed = new Network[](numNotNetworkType);
        for (uint i = 0; i < numNotNetworkType; i++) {
            trimmed[i] = notNetworkType[i];
        }
        return trimmed;
    }

    function toString(address[] memory _ary) private pure returns (string memory) {
        string memory result = "\n";
        for (uint i = 0; i < _ary.length; i++) {
            result = string.concat(result, vm.toString(_ary[i]));
            if (i != _ary.length - 1) {
                result = string.concat(result, "\n");
            }
        }
        result = string.concat(result);
        return result;
    }

    // TODO: make sure this is called before the deployment occurs.
    function getPrevConfig() private view returns (PreviousInfo memory) {
        if (address(auth).code.length == 0) {
            return PreviousInfo({
                // We set these to default values.
                owners: new address[](0),
                proposers: new address[](0),
                threshold: 0,
                version: Version({major: major, minor: minor, patch: patch}),
                isManagerDeployed: false,
                firstProposalOccurred: false,
                isExecuting: false
            });
        } else {
            uint256 numOwners = auth.getRoleMemberCount(0x00);
            address[] memory owners = new address[](numOwners);
            for (uint i = 0; i < numOwners; i++) {
                owners[i] = auth.getRoleMember(0x00, i);
            }

            // Do the same for proposers.
            uint256 numProposers = auth.getRoleMemberCount(keccak256("ProposerRole"));
            address[] memory proposers = new address[](numProposers);
            for (uint i = 0; i < numProposers; i++) {
                proposers[i] = auth.getRoleMember(keccak256("ProposerRole"), i);
            }

            return PreviousInfo({
                owners: owners,
                proposers: proposers,
                threshold: auth.threshold(),
                version: ISemver(address(manager)).version(),
                isManagerDeployed: true,
                firstProposalOccurred: auth.firstProposalOccurred(),
                isExecuting: manager.isExecuting()
            });
        }
    }

    /**
     * @notice Checks if the rpcUrl is a live network by attempting to call the `hardhat_getAutomine` rpc method on it.
     *         If the rpcUrl is anvil or hardat, the exit code will be 0. If the rpcUrl is a live network, the exit code
     *         will be 1.
     */
    function isLiveNetwork(string memory _rpcUrl) private returns (bool) {
        // TODO(docs): `exit_code` will be 1 if the network is a live network (i.e. not an Anvil or Hardhat node).
        string[] memory inputs = new string[](5);
        inputs[0] = "cast";
        inputs[1] = "rpc";
        inputs[2] = "hardhat_getAutomine";
        inputs[3] = "--rpc-url";
        inputs[4] = _rpcUrl;
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        return result.exit_code == 1;
    }

    /**
     * @notice Filters out the duplicate networks and returns an array of unique networks.
     * @param _networks The networks to filter.
     * @return trimmed The unique networks.
     */
    function deduplicateElements(Network[] memory _networks) private pure returns (Network[] memory) {
        // We return early here because the for-loop below will throw an underflow error if the array is empty.
        if (_networks.length == 0) return new Network[](0);

        Network[] memory sorted = sortNetworks(_networks);
        Network[] memory duplicates = new Network[](_networks.length);
        uint numDuplicates = 0;
        for (uint i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] == sorted[i + 1]) {
                duplicates[numDuplicates] = sorted[i];
                numDuplicates++;
            }
        }
        Network[] memory trimmed = new Network[](numDuplicates);
        for (uint i = 0; i < numDuplicates; i++) {
            trimmed[i] = duplicates[i];
        }
        return trimmed;
    }

    /**
     * @notice Filters out the duplicate addresses and returns an array of unique addresses.
     * @param _ary The addresses to filter.
     * @return trimmed The unique addresses.
     */
    function deduplicateElements(address[] memory _ary) private pure returns (address[] memory) {
        // We return early here because the for-loop below will throw an underflow error if the array is empty.
        if (_ary.length == 0) return new address[](0);

        address[] memory sorted = sortAddresses(_ary);
        address[] memory duplicates = new address[](_ary.length);
        uint numDuplicates = 0;
        for (uint i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] == sorted[i + 1]) {
                duplicates[numDuplicates] = sorted[i];
                numDuplicates++;
            }
        }
        address[] memory trimmed = new address[](numDuplicates);
        for (uint i = 0; i < numDuplicates; i++) {
            trimmed[i] = duplicates[i];
        }
        return trimmed;
    }

    /**
     * @notice Sorts the networks in ascending order according to the Network enum's value.
     * @param _unsorted The networks to sort.
     * @return sorted The sorted networks.
     */
    function sortNetworks(Network[] memory _unsorted) private pure returns (Network[] memory) {
        Network[] memory sorted = _unsorted;
        for (uint i = 0; i < sorted.length; i++) {
            for (uint j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    Network temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        return sorted;
    }

    // function makeSphinxConfig() private {
    //     sphinxConfig.projectName = projectName;
    //     sphinxConfig.orgId = orgId;
    //     sphinxConfig.owners = owners;
    //     sphinxConfig.proposers = proposers;
    //     sphinxConfig.mainnets = mainnets;
    //     sphinxConfig.testnets = testnets;
    //     sphinxConfig.threshold = threshold;
    //     sphinxConfig.version = version;
    // }

    function getMappingValueSlotKey(bytes32 _mappingSlotKey, bytes32 _key) private pure returns (bytes32) {
        bytes memory encodedMappingKey = abi.encode(_key);
        return keccak256(abi.encodePacked(encodedMappingKey, _mappingSlotKey));
    }

    /**
     * @notice Deploys a contract at the expected Sphinx address. Called from the auto generated Sphinx Client.
     *         To deploy contracts during the simulation phase.
     *
     *         We use a proxy pattern to allow the user to interact with their Client contracts while still accurately simulating
     *         the real functionality of their underlying contracts including their constructor logic and storage layout.
     *
     *         This function performs a three step process to setup this proxy pattern.
     *         1. Generate the CREATE3 address for the contract and deploy the contract to that address.
     *            This ensures the storage of the proxy is setup correctly by running any code defined in the contract constructor.
     *         2. Etch the contract code to a separate implementation address which is the CREATE3 address minus one.
     *         3. Deploy the client code to the CREATE3 address with the implementation address as a constructor argument.
     *
     *         After this process is complete, the user can interact with their contract by calling functions on the client, and the
     *         client will delegate those calls to the implementation.
     *
     * @dev    It's important that when this function is called, we must use a prank to set the `msg.sender` to the address of the
     *         users SphinxManager to mirror the exact process on a live network. This is because the user may have logic in their
     *         constructor which relies on the `msg.sender` being accurate. For example, they may grant some role to the SphinxManager
     *         which allows it to do some privileged configuration after the contract has been deployed.
     *
     * @dev    For more detail on the process of actually calling a function on the client, see `_callFunction` in AbstractContractClient.sol.
     *
     * @param _referenceName     The reference name of the contract to deploy. Used to generate the contracts address.
     * @param _userSalt          The user's salt. Used to generate the contracts address.
     * @param _constructorArgs   The constructor arguments for the contract.
     * @param fullyQualifiedName The fully qualified name of the contract to deploy.
     * @param clientArtifactPath The path to the artifact for the client contract which corresponds to the contract to deploy.
     *                           See sphinxDeployCodeTo for more detail on why the artifact is used instead of the FQN.
     * @param artifactPath       The path to the artifact for the actual contract to deploy.
     */
    function _deployContract(
        string memory _referenceName,
        bytes32 _userSalt,
        bytes memory _constructorArgs,
        string memory fullyQualifiedName,
        string memory clientArtifactPath,
        string memory artifactPath
    ) internal returns (address) {
        require(
            !isReferenceNameUsed(_referenceName),
            string(
                abi.encodePacked("Sphinx: The reference name ",
                _referenceName,
                " was used more than once in this deployment. Reference names must be unique.")
            )
        );

        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        address create3Address = computeCreate3Address(address(manager), create3Salt);

        bool skipDeployment = create3Address.code.length > 0;

        bytes memory actionData = abi.encode(vm.getCode(artifactPath), _constructorArgs, _userSalt, _referenceName);
        actions.push(SphinxAction({
            fullyQualifiedName: fullyQualifiedName,
            actionType: SphinxActionType.DEPLOY_CONTRACT,
            data: actionData,
            skip: skipDeployment
        }));

        // Calculate implementation address
        address impl = address(uint160(address(create3Address)) - 1);


        if (!skipDeployment && initialCallerMode != VmSafe.CallerMode.RecurrentBroadcast) {
            // Deploy the user's contract to the CREATE3 address.
            sphinxDeployCodeTo(artifactPath, _constructorArgs, create3Address);
        }

        // Set the user's contract's code to the implementation address.
        vm.etch(impl, create3Address.code);

        // Deploy the client to the CREATE3 address.
        sphinxDeployCodeTo(clientArtifactPath, abi.encode(manager, address(this), impl), create3Address);

        return create3Address;
    }

    /**
     * @notice Defines that a contract is deployed already at a particular address and allows the user to
     *         interact with it via a client. This function differs from the `_deployContract` function in
     *         that it assumes that the contract is already deployed at the target address.
     *
     *         This function works very similarly to the `_deployContract` function, but instead of deploying
     *         the contract, we assume that it's already deployed and just move the implementation code to the
     *         implementation (target address minus one), and then deploy the client to the target address.
     *
     *         Like the `_deployContract` function, this function is called from the auto generated Sphinx Client
     *         and uses a proxy pattern to simulate interactions with contracts that are defined using this function.
     *
     * @notice It is up to the user to make sure that the correct contract is deployed at the target address.
     *         We check that there is code at the address, but we do not check that it's correct.
     */
    function _defineContract(
        string memory _referenceName,
        address _targetAddress,
        string memory _fullyQualifiedName,
        string memory _clientPath
    ) internal returns (address) {
        require(
            !isReferenceNameUsed(_referenceName),
            string(
                abi.encodePacked("Sphinx: The reference name ",
                _referenceName,
                " was used more than once in this deployment. Reference names must be unique.")
            )
        );
        require(_targetAddress.code.length > 0, string(abi.encodePacked("Sphinx: The contract ", _referenceName, " at ", vm.toString(_targetAddress), " is not deployed on this network. Please make sure that the address and network are correct.")));

        /* Even though this contract does not need to be deployed, we still push an action to the actions array
         * so that we can keep track of the reference name for use later. We use a different action type `DEFINE_CONTRACT`
         * so we can easily filter out these actions, and the `skip` field is always set to true because we don't need to
         * deploy the contract.
         */
        bytes memory actionData = abi.encode(_targetAddress, _referenceName);
        actions.push(SphinxAction({
            fullyQualifiedName: _fullyQualifiedName,
            actionType: SphinxActionType.DEFINE_CONTRACT,
            data: actionData,
            skip: true
        }));

        // The implementation's address is the current address minus one.
        address impl = address(uint160(address(_targetAddress)) - 1);

        // Set the user's contract's code to the implementation address.
        vm.etch(impl, _targetAddress.code);

        // Deploy the client to the CREATE3 address.
        sphinxDeployCodeTo(
            _clientPath,
            abi.encode(manager, address(this), impl),
            _targetAddress
        );
        return _targetAddress;
    }

    function addSphinxAction(SphinxAction memory _action) external {
        actions.push(_action);
    }

    function setChainInfo(
        bool _isLiveNetwork,
        PreviousInfo memory _prevConfig,
        SphinxConfig memory _newConfig
    ) private {
        SphinxAction[] memory trimmed = removeActionType(actions, SphinxActionType.DEFINE_CONTRACT);

        for (uint i = 0; i < trimmed.length; i++) {
            chainInfo.actionsTODO.push(trimmed[i]);
        }

        chainInfo.authAddress = address(auth);
        chainInfo.managerAddress = address(manager);
        chainInfo.chainId = block.chainid;
        chainInfo.newConfig = _newConfig;
        chainInfo.isLiveNetwork = _isLiveNetwork;
        chainInfo.prevConfig = _prevConfig;
    }

    // TODO(docs): we need to define this explicitly for the same reason we need to define
    // SphinxManager.deployments(...) explicitly.
    function getChainInfo() external view returns (ChainInfo memory) {
        return chainInfo;
    }

    function getReferenceNameForAddress(address _create3Address) external view returns (string memory) {
        for (uint256 i = 0; i < actions.length; i++) {
            SphinxAction memory action = actions[i];
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , bytes32 userSalt, string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
                address create3Address = computeCreate3Address(address(manager), sphinxCreate3Salt);
                if (create3Address == _create3Address) {
                    return referenceName;
                }
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (address addr, string memory referenceName) = abi.decode(action.data, (address, string));
                if (addr == _create3Address) {
                    return referenceName;
                }
            }
        }
        revert("Sphinx: No reference name found for the given address. Should never happen.");
    }

    function removeActionType(SphinxAction[] memory _actions, SphinxActionType _actionType) private pure returns (SphinxAction[] memory) {
        SphinxAction[] memory filtered = new SphinxAction[](_actions.length);
        uint numFiltered = 0;
        for (uint i = 0; i < _actions.length; i++) {
            if (_actions[i].actionType != _actionType) {
                filtered[numFiltered] = _actions[i];
                numFiltered++;
            }
        }
        SphinxAction[] memory trimmed = new SphinxAction[](numFiltered);
        for (uint i = 0; i < numFiltered; i++) {
            trimmed[i] = filtered[i];
        }
        return trimmed;
    }

    function isReferenceNameUsed(string memory _referenceName) private view returns (bool) {
        for (uint256 i = 0; i < actions.length; i++) {
            SphinxAction memory action = actions[i];
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , , string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                if (keccak256(abi.encode(referenceName)) == keccak256(abi.encode(_referenceName))) {
                    return true;
                }
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (, string memory referenceName) = abi.decode(action.data, (address, string));
                if (keccak256(abi.encode(referenceName)) == keccak256(abi.encode(_referenceName))) {
                    return true;
                }
            }
        }
        return false;
    }
}
