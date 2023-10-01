// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { VmSafe, Vm } from "forge-std/Vm.sol";
import { console } from "forge-std/console.sol";

import { IAccessControl } from "@sphinx-labs/contracts/contracts/interfaces/IAccessControl.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import {
    ISphinxAuthFactory
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import {
    DeploymentState,
    Version,
    DeploymentStatus,
    RawSphinxAction,
    SphinxActionType,
    AuthLeafType
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    BundledSphinxAction,
    SphinxTarget,
    BundledSphinxTarget,
    BundleInfo,
    HumanReadableAction,
    Network,
    SphinxActionInput,
    SphinxConfig,
    BundleInfo,
    InitialChainState,
    DeploymentInfo,
    BundledAuthLeaf,
    SphinxMode,
    NetworkInfo
} from "./SphinxPluginTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";

// TODO(docs): all functions in this contracts have names that begin with "sphinx" to avoid name
// collisions with functions that the user defines. This applies to private functions too, since the
// compiler doesn't allow you to define a private function with the same signature in a parent
// contract and a child contract. This also applies to any state variables that aren't private,
// since private variables of the same name can be defined in a parent and child contract.
abstract contract Sphinx {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // TODO(docs): answer the question, " why does the SphinxActionInput have so many things encoded in
    // the data field instead of stored as their own fields?"

    DeploymentInfo private deploymentInfo;

    SphinxConstants private immutable constants;

    // TODO(docs): this must have `internal` visibility so that the user can set fields on it.
    SphinxConfig internal sphinxConfig;
    SphinxUtils internal immutable sphinxUtils;

    // TODO(md): forge-std needs to be 1.6.1

    // TODO(md): it may be surprising to the user if a previously deployed contract (with
    // different bytecode or a different abi) is returned from a "deploy<Contract>" call instead of
    // their new contract. consider changing the name of the deploy function to "ensureDeployed" or
    // something, or just explain that this is how the tool works.

    // TODO(md): perhaps add to faq that users can use `computeCreateAddress` from `StdUtils.sol`.

    // TODO(test): if the user's contract's constructor reverts during the deployment, can we recover
    // the reason? maybe the returned data could be helpful?

    SphinxMode public sphinxMode;
    bool public sphinxModifierEnabled;

    ISphinxManager private manager;
    ISphinxAuth private auth;

    // TODO(docs): this is outdated i think
    /**
     * @notice We expect that the user will inherit from this contract in their Sphinx script. When they do so, they'll
     *         also be required to call this constructor with their configuration options.
     *
     *         Required for every deployment:
     *          - string projectName:  The name of the project, e.g. "My Project", impacts contract addresses.
     *          - address[] owners:    The addresses of the owners of the project, e.g. [0x123..., 0x456...], impacts contract addresses.
     *          - Version version:     The version of the project, e.g. Version({ major: 0, minor: 2, patch: 4 }).
     *
     *         Required when using the DevOps platform:
     *          - string orgId:        The ID of the organization, e.g. "12345", required to interact with the DevOps platform.
     *          - address[] proposers: The addresses of the proposers of the project, e.g. [0x123..., 0x456...], required to propose deployments.
     *                                 If there is no proposer defined and only one owner, then we use the owner as the proposer.
     *          - Network[] mainnets:  The mainnet networks to deploy to, e.g. [Network.ethereum, Network.optimism, Network.arbitrum].
     *          - Network[] testnets:  The testnet networks to deploy to, e.g. [Network.goerli, Network.optimism_goerli, Network.arbitrum_goerli].
     *          - uint256 threshold:   The number of owners required to approve a deployment, e.g. 1.
     *
     * @dev We cannot perform any state-changing transactions or deploy any contracts inside this constructor
     *         because the user may create a fork in their script which will cause the state to be discarded.
     *         If we need to execute transactions/deploy contracts, we must do so in the `sphinx` modifier.
     *
     *         So the correct process is:
     *         1. User does `function run() { vm.createSelectFork(...); deploy(...); }`
     *         2. We execute the transactions/deploy the contracts in the `sphinx` modifier after the fork is selected.
     *         3. The deploy(...) will succeed b/c the transactions/contracts were executed in the new fork.
     */
    constructor() {
        // Set default values for the SphinxConfig
        sphinxConfig.version = Version({ major: 0, minor: 2, patch: 5 });

        sphinxUtils = new SphinxUtils();
        constants = new SphinxConstants();

        // TODO(docs): Keep these contracts deployed in a multi-fork setup, i.e. proposals.
        vm.makePersistent(address(constants));
        vm.makePersistent(address(sphinxUtils));
    }

    // TODO(optional): Make a note that you decided not to do this: I decided not to implement the logic
    // in the SphinxAuth contract that throws an error if there's an active auth bundle. I realized
    // that if the user needs to call the `setup` function more than once, this logic would prevent
    // them from doing it. I'd need to spend more time thinking about a proper solution, but it
    // doesn't strike me as important enough to prioritize for this release.

    // TODO(docs): this functoin is called without the `--broadcast` flag for the preview.
    function sphinxDeployTask(string memory _networkName, string memory _deploymentInfoPath) external {
        uint256 privateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        require(
            privateKey != 0,
            "Sphinx: You must set the 'PRIVATE_KEY' environment variable to run the deployment."
        );
        Network network = sphinxUtils.findNetworkInfoByName(_networkName).network;
        vm.startBroadcast(privateKey);
        deploy(network);
        vm.stopBroadcast();
        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxProposeTask(bool _testnets, string memory _deploymentInfoPath) external {
        Network[] memory networks = _testnets ? sphinxConfig.testnets : sphinxConfig.mainnets;

        require(
            sphinxConfig.proposers.length > 0,
            "Sphinx: There must be at least one proposer in your 'sphinxConfig.proposers' array."
        );
        uint256 proposerPrivateKey = vm.envOr("PROPOSER_PRIVATE_KEY", uint256(0));
        require(
            proposerPrivateKey != 0,
            "Sphinx: You must set the 'PROPOSER_PRIVATE_KEY' environment variable to propose a deployment."
        );
        address proposer = vm.addr(proposerPrivateKey);
        require(
            networks.length > 0,
            string(
                abi.encodePacked(
                    "Sphinx: There must be at least one network in your ",
                    _testnets ? "'testnets'" : "'mainnets",
                    " array."
                )
            )
        );
        require(
            bytes(sphinxConfig.orgId).length > 0,
            "Sphinx: Your 'orgId' cannot be an empty string. Please retrieve it from Sphinx's UI."
        );

        // TODO(test): try compiling with the earliest solc version you support (0.7.4)

        sphinxMode = SphinxMode.Proposal;

        DeploymentInfo[] memory deploymentInfoArray = new DeploymentInfo[](networks.length);
        uint256[] memory forkIds = new uint256[](networks.length);
        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];
            NetworkInfo memory networkInfo = sphinxUtils.getNetworkInfo(network);
            string memory rpcUrl = vm.rpcUrl(networkInfo.name);

            // TODO(docs): `vm.createSelectFork` sets the` `block.chainid` to the target chain (e.g.
            // 1 for ethereum mainnet).
            uint256 forkId = vm.createSelectFork(rpcUrl);
            forkIds[i] = forkId;

            sphinxUtils.initialize(rpcUrl);

            InitialChainState memory initialState = sphinxUtils.getInitialChainState(auth, manager);
            rpcUrl = vm.rpcUrl(sphinxUtils.getNetworkInfo(network).name);

            bool firstProposalOccurred = address(auth).code.length > 0
                ? auth.firstProposalOccurred()
                : false;
            if (firstProposalOccurred) {
                require(
                    IAccessControl(address(auth)).hasRole(keccak256("ProposerRole"), proposer),
                    string(
                        abi.encodePacked(
                            "Sphinx: The address ",
                            vm.toString(proposer),
                            " is not currently a proposer on ",
                            networkInfo.name,
                            "."
                        )
                    )
                );
            } else {
                require(
                    sphinxUtils.arrayContainsAddress(sphinxConfig.proposers, proposer),
                    string(
                        abi.encodePacked(
                            "Sphinx: The address corresponding to your 'PROPOSER_PRIVATE_KEY' env variable is not in\n your 'proposers' array. Please add it or change your private key.\n Address: ",
                            vm.toString(proposer)
                        )
                    )
                );
            }

            deploy(network);

            sphinxUpdateDeploymentInfo(rpcUrl, initialState, sphinxConfig, sphinxMode);
            deploymentInfoArray[i] = deploymentInfo;
        }

        (bytes32 authRoot, BundleInfo[] memory bundleInfoArray) = sphinxUtils.getBundleInfoFFI(
            deploymentInfoArray
        );

        for (uint256 i = 0; i < bundleInfoArray.length; i++) {
            uint256 forkId = forkIds[i];
            BundleInfo memory bundleInfo = bundleInfoArray[i];

            vm.selectFork(forkId);

            vm.startPrank(proposer);
            sphinxDeployOnNetwork(authRoot, bundleInfo);
            vm.stopPrank();
        }

        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfoArray)));
    }

    // TODO(test): check for the expected number of broadcasted transactions in `sphinx deploy`.
    // e.g. it seemes there's an `authFactory.auths()` call being made that costs eth.

    function sphinxRegisterProject() private {
        address[] memory sortedOwners = sphinxUtils.sortAddresses(sphinxConfig.owners);

        bytes memory authData = abi.encode(sortedOwners, sphinxConfig.threshold);

        ISphinxAuthFactory authFactory = ISphinxAuthFactory(constants.authFactoryAddress());
        bytes32 authSalt = keccak256(abi.encode(authData, sphinxConfig.projectName));
        bool isRegistered = address(authFactory.auths(authSalt)) != address(0);
        if (!isRegistered) {
            // TODO(docs): we hard-code the `gas` because... also, explain that this does not impact
            // the actual gas used. it's just an upper bound.
            authFactory.deploy{ gas: 2000000 }(authData, hex"", sphinxConfig.projectName);
        }
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function sphinxExecuteBatchActions(
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
                // TODO(docs): explain why we use a low-level call here.
                (bool success, bytes memory result) = address(manager).call{
                    gas: bufferedGasLimit
                }(
                    abi.encodeCall(
                        ISphinxManager.executeInitialActions, (rawActions, _proofs)
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

    function sphinxExecuteDeployment(
        BundleInfo memory bundleInfo,
        uint256 blockGasLimit
    ) private returns (bool, HumanReadableAction memory) {
        // TODO(docs)
        HumanReadableAction memory emptyAction;

        (
            BundledSphinxAction[] memory initialActions,
            BundledSphinxAction[] memory setStorageActions
        ) = sphinxUtils.splitActions(bundleInfo.actionBundle.actions);

        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        // Execute all the deploy contract actions and exit early if the deployment failed
        (DeploymentStatus status, uint failedActionIndex) = sphinxExecuteBatchActions(
            initialActions,
            false,
            bufferedGasLimit
        );
        if (status == DeploymentStatus.FAILED) {
            // Return with the relevant human readable action
            return (false, bundleInfo.humanReadableActions[failedActionIndex]);
        } else if (status == DeploymentStatus.COMPLETED) {
            return (true, emptyAction);
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
        sphinxExecuteBatchActions(setStorageActions, true, bufferedGasLimit);

        // Complete the upgrade
        manager.finalizeUpgrade{ gas: 1000000 }(targets, proofs);

        return (true, emptyAction);
    }

    /**
     * @notice Returns the number of times a call hash has been attempted in this deployment.
     */
    function sphinxGetCallCountInDeployment(bytes32 _callHash) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < deploymentInfo.actionInputs.length; i++) {
            SphinxActionInput memory action = deploymentInfo.actionInputs[i];
            if (action.actionType == SphinxActionType.CALL) {
                (address to, bytes4 selector, bytes memory functionArgs, , ) = abi.decode(
                    action.data,
                    (address, bytes4, bytes, uint256, string)
                );
                bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
                bytes32 callHash = keccak256(abi.encode(to, encodedCall));
                if (callHash == _callHash) {
                    count += 1;
                }
            }
        }
        return count;
    }

    // TODO(test): What should be the expected behavior if you call deploy(optimism) and then call deploy(arbitrum) in the same script?

    modifier sphinx(Network _network) {
        sphinxModifierEnabled = true;

        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
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

        sphinxUtils.validate(sphinxConfig, _network);

        auth = ISphinxAuth(
            sphinxUtils.getSphinxAuthAddress(
                sphinxConfig.owners,
                sphinxConfig.threshold,
                sphinxConfig.projectName
            )
        );
        manager = ISphinxManager(
            sphinxUtils.getSphinxManagerAddress(
                sphinxConfig.owners,
                sphinxConfig.threshold,
                sphinxConfig.projectName
            )
        );

        if (sphinxMode == SphinxMode.Proposal) {
            delete deploymentInfo;
            vm.startPrank(address(manager));
            _;
            vm.stopPrank();

            sphinxUtils.removeClients(deploymentInfo.actionInputs, manager);
        } else if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            sphinxMode = SphinxMode.Broadcast;
            vm.stopBroadcast();

            string memory rpcUrl = vm.rpcUrl(sphinxUtils.getNetworkInfo(_network).name);
            sphinxUtils.initialize(rpcUrl);

            InitialChainState memory initialState = sphinxUtils.getInitialChainState(auth, manager);
            sphinxUtils.liveNetworkValidation(sphinxConfig, initialState, auth, msgSender);

            // TODO(docs): we must make the owner a proposer, or else the execution logic will fail, since
            // a proposer is required to call the `SphinxAuth.propose` function.
            if (sphinxConfig.owners.length == 1 && sphinxConfig.proposers.length == 0) {
                sphinxConfig.proposers.push(sphinxConfig.owners[0]);
            }

            delete deploymentInfo;
            vm.startPrank(address(manager));
            _;
            vm.stopPrank();

            sphinxUpdateDeploymentInfo(rpcUrl, initialState, sphinxConfig, sphinxMode);

            DeploymentInfo[] memory deploymentInfoArray = new DeploymentInfo[](1);
            deploymentInfoArray[0] = deploymentInfo;
            (bytes32 authRoot, BundleInfo[] memory bundleInfoArray) = sphinxUtils.getBundleInfoFFI(
                deploymentInfoArray
            );
            require(bundleInfoArray.length == 1, "Sphinx: TODO(docs). Should never happen.");
            BundleInfo memory bundleInfo = bundleInfoArray[0];

            sphinxUtils.removeClients(deploymentInfo.actionInputs, manager);

            vm.startBroadcast(msgSender);
            sphinxDeployOnNetwork(authRoot, bundleInfo);
        } else if (sphinxMode == SphinxMode.Default) {
            // TODO(docs): if we call this when broadcasting, the `authFactory.register` call will throw
            // an error b/c the sphinxmanager already exists.
            sphinxUtils.deploySphinxManagerTo(address(manager));

            delete deploymentInfo;
            vm.startPrank(address(manager));
            _;
            vm.stopPrank();

            sphinxUtils.removeClients(deploymentInfo.actionInputs, manager);

            // TODO(docs): we update the sphinxManager at the end of the deployment because this
            // mimics what happens on a live network.
            for (uint i = 0; i < deploymentInfo.actionInputs.length; i++) {
                SphinxActionInput memory action = deploymentInfo.actionInputs[i];
                if (action.actionType == SphinxActionType.CALL && !action.skip) {
                    (address to, bytes4 selector, bytes memory functionArgs, , ) = abi.decode(
                        action.data,
                        (address, bytes4, bytes, uint256, string)
                    );
                    bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
                    bytes32 callHash = keccak256(abi.encode(to, encodedCall));

                    bytes32 mappingValueSlotKey = sphinxUtils.getMappingValueSlotKey(
                        constants.callNoncesSlotKey(),
                        callHash
                    );
                    uint256 currentNumCallsInManager = manager.callNonces(callHash);
                    vm.store(
                        address(manager),
                        mappingValueSlotKey,
                        bytes32(currentNumCallsInManager + 1)
                    );
                }
            }
        }

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);

        sphinxModifierEnabled = false;
    }

    function sphinxDeployOnNetwork(bytes32 _authRoot, BundleInfo memory _bundleInfo) private {
        (, address msgSender, ) = vm.readCallers();

        if (_bundleInfo.authLeafs.length == 0) {
            console.log(string(abi.encodePacked("Sphinx: Nothing to execute on", _bundleInfo.networkName, ". Exiting early.")));
            return;
        }

        sphinxRegisterProject();

        bytes32 deploymentId = sphinxUtils.getDeploymentId(
            _bundleInfo.actionBundle,
            _bundleInfo.targetBundle,
            _bundleInfo.configUri
        );
        DeploymentState memory deploymentState = manager.deployments(deploymentId);

        if (deploymentState.status == DeploymentStatus.COMPLETED) {
            console.log(string(abi.encodePacked("Sphinx: Deployment was already completed on ", _bundleInfo.networkName, ". Exiting early.")));
            return;
        }

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            // TODO(docs): the ownerSignatureArray is length 0 for proposals because...
            bytes[] memory ownerSignatureArray;
            if (sphinxMode == SphinxMode.Broadcast) {
                ownerSignatureArray = new bytes[](1);
                ownerSignatureArray[0] = sphinxUtils.signMetaTxnForAuthRoot(
                    vm.envUint("PRIVATE_KEY"),
                    _authRoot
                );
            }

            if (sphinxMode == SphinxMode.Proposal) {
                vm.store(address(auth), constants.ownerThresholdSlotKey(), bytes32(0));
            }

            (, uint256 leafsExecuted, ) = auth.authStates(_authRoot);
            for (uint i = 0; i < _bundleInfo.authLeafs.length; i++) {
                BundledAuthLeaf memory leaf = _bundleInfo.authLeafs[i];

                if (leafsExecuted > leaf.leaf.index) {
                    continue;
                }

                if (leaf.leafType == AuthLeafType.SETUP) {
                    auth.setup{ gas: 3000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafType == AuthLeafType.PROPOSE) {
                    if (sphinxMode == SphinxMode.Broadcast) {
                        auth.propose{ gas: 1000000 }(
                            _authRoot,
                            leaf.leaf,
                            ownerSignatureArray,
                            leaf.proof
                        );
                    } else if (sphinxMode == SphinxMode.Proposal) {
                        if (!IAccessControl(address(auth)).hasRole(keccak256("ProposerRole"), msgSender)) {
                            bytes32 proposerRoleSlotKey = sphinxUtils.getMappingValueSlotKey(
                                constants.authAccessControlRoleSlotKey(),
                                keccak256("ProposerRole")
                            );
                            bytes32 proposerMemberSlotKey = sphinxUtils.getMappingValueSlotKey(
                                proposerRoleSlotKey,
                                bytes32(uint256(uint160(msgSender)))
                            );
                            vm.store(address(auth), proposerMemberSlotKey, bytes32(uint256(1)));
                        }

                        bytes[] memory proposerSignatureArray = new bytes[](1);
                        proposerSignatureArray[0] = sphinxUtils.signMetaTxnForAuthRoot(
                            vm.envUint("PROPOSER_PRIVATE_KEY"),
                            _authRoot
                        );

                        auth.propose{ gas: 1000000 }(
                            _authRoot,
                            leaf.leaf,
                            proposerSignatureArray,
                            leaf.proof
                        );
                    }
                } else if (leaf.leafType == AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL) {
                    auth.upgradeManagerAndAuthImpl{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafType == AuthLeafType.APPROVE_DEPLOYMENT) {
                    auth.approveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafType == AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT) {
                    auth.cancelActiveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else {
                    revert("Unsupported auth leaf type. Should never happen.");
                }
            }
            deploymentState.status = DeploymentStatus.APPROVED;
        }

        // TODO(docs)
        if (sphinxMode == SphinxMode.Proposal) {
            vm.stopPrank();
            sphinxUtils.addRemoteExecutor(msgSender, manager);
            vm.startPrank(msgSender);
            manager.claimDeployment();
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED ||
            deploymentState.status == DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
        ) {
            (bool executionSuccess, HumanReadableAction memory readableAction) = sphinxExecuteDeployment(
                _bundleInfo,
                block.gaslimit
            );

            if (!executionSuccess) {
                bytes memory revertMessage = abi.encodePacked(
                    "Sphinx: failed to execute deployment because the following action reverted: ",
                    readableAction.reason
                );

                revert(string(revertMessage));
            }
        }
    }

    // TODO(test): we need to compile the plugins package with and without the optimizer to ensure that a
    // "stack too deep" error doesn't occur. (first, test that the private function inline thing
    // leads to a stack too deep error when the optimizer is enabled)

    function deploy(Network _network) public virtual;

    // TODO(optional): say a user has multiple owners, and they're planning to propose via the DevOps platform,
    // and they want to deploy their system onto anvil via `sphinx deploy`. it doesn't seem like they
    // can do that right now?

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
     *                           See `SphinxUtils.deployCodeToAddress` for more detail on why the artifact is used instead of the FQN.
     * @param artifactPath       The path to the artifact for the actual contract to deploy.
     */
    function _sphinxDeployContract(
        string memory _referenceName,
        bytes32 _userSalt,
        bytes memory _constructorArgs,
        string memory fullyQualifiedName,
        string memory clientArtifactPath,
        string memory artifactPath
    ) internal returns (address) {
        require(
            sphinxModifierEnabled,
            "Sphinx: You must include the 'sphinx(Network)' modifier in your deploy function."
        );
        require(
            !sphinxUtils.isReferenceNameUsed(_referenceName, deploymentInfo.actionInputs),
            string(
                abi.encodePacked(
                    "Sphinx: The reference name ",
                    _referenceName,
                    " was used more than once in this deployment. Reference names must be unique."
                )
            )
        );

        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        address create3Address = sphinxUtils.computeCreate3Address(address(manager), create3Salt);

        bool skipDeployment = create3Address.code.length > 0;

        bytes memory actionData = abi.encode(
            vm.getCode(artifactPath),
            _constructorArgs,
            _userSalt,
            _referenceName
        );
        deploymentInfo.actionInputs.push(
            SphinxActionInput({
                fullyQualifiedName: fullyQualifiedName,
                actionType: SphinxActionType.DEPLOY_CONTRACT,
                data: actionData,
                skip: skipDeployment
            })
        );

        // Calculate implementation address
        address impl = address(uint160(address(create3Address)) - 1);

        if (!skipDeployment && sphinxMode == SphinxMode.Default) {
            // Deploy the user's contract to the CREATE3 address. This must be called by pranking
            // the SphinxManager to ensure that the `msg.sender` in the body of the user's
            // constructor is the SphinxManager. This mirrors what happens on a live network.
            sphinxUtils.deployCodeToAddress(artifactPath, _constructorArgs, create3Address);
        }

        // Set the user's contract's code to the implementation address.
        vm.etch(impl, create3Address.code);

        // Deploy the client to the CREATE3 address.
        sphinxUtils.deployCodeToAddress(
            clientArtifactPath,
            abi.encode(manager, address(this), impl),
            create3Address
        );

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
    function _sphinxDefineContract(
        string memory _referenceName,
        address _targetAddress,
        string memory _fullyQualifiedName,
        string memory _clientPath
    ) internal returns (address) {
        require(
            sphinxModifierEnabled,
            "Sphinx: You must include the 'sphinx(Network)' modifier in your deploy function."
        );
        require(
            !sphinxUtils.isReferenceNameUsed(_referenceName, deploymentInfo.actionInputs),
            string(
                abi.encodePacked(
                    "Sphinx: The reference name ",
                    _referenceName,
                    " was used more than once in this deployment. Reference names must be unique."
                )
            )
        );
        require(
            _targetAddress.code.length > 0,
            string(
                abi.encodePacked(
                    "Sphinx: The contract ",
                    _referenceName,
                    " at ",
                    vm.toString(_targetAddress),
                    " is not deployed on this network. Please make sure that the address and network are correct."
                )
            )
        );

        /* Even though this contract does not need to be deployed, we still push an action to the actions array
         * so that we can keep track of the reference name for use later. We use a different action type `DEFINE_CONTRACT`
         * so we can easily filter out these actions, and the `skip` field is always set to true because we don't need to
         * deploy the contract.
         */
        bytes memory actionData = abi.encode(_targetAddress, _referenceName);
        deploymentInfo.actionInputs.push(
            SphinxActionInput({
                fullyQualifiedName: _fullyQualifiedName,
                actionType: SphinxActionType.DEFINE_CONTRACT,
                data: actionData,
                skip: true
            })
        );

        // The implementation's address is the current address minus one.
        address impl = address(uint160(address(_targetAddress)) - 1);

        // Set the user's contract's code to the implementation address.
        vm.etch(impl, _targetAddress.code);

        // Deploy the client to the CREATE3 address.
        sphinxUtils.deployCodeToAddress(_clientPath, abi.encode(manager, address(this), impl), _targetAddress);
        return _targetAddress;
    }

    function sphinxAddActionInput(SphinxActionInput memory _input) external {
        deploymentInfo.actionInputs.push(_input);
    }

    function sphinxUpdateDeploymentInfo(
        string memory _rpcUrl,
        InitialChainState memory _initialState,
        SphinxConfig memory _newConfig,
        SphinxMode _mode
    ) private {
        deploymentInfo.authAddress = address(auth);
        deploymentInfo.managerAddress = address(manager);
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.newConfig = _newConfig;
        deploymentInfo.isLiveNetwork = sphinxUtils.isLiveNetworkFFI(_rpcUrl);
        deploymentInfo.initialState = _initialState;
        deploymentInfo.remoteExecution = _mode == SphinxMode.Proposal;
    }

    function sphinxGetReferenceNameForAddress(
        address _create3Address
    ) external view returns (string memory) {
        for (uint256 i = 0; i < deploymentInfo.actionInputs.length; i++) {
            SphinxActionInput memory action = deploymentInfo.actionInputs[i];
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , bytes32 userSalt, string memory referenceName) = abi.decode(
                    action.data,
                    (bytes, bytes, bytes32, string)
                );
                bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
                address create3Address = sphinxUtils.computeCreate3Address(address(manager), sphinxCreate3Salt);
                if (create3Address == _create3Address) {
                    return referenceName;
                }
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (address addr, string memory referenceName) = abi.decode(
                    action.data,
                    (address, string)
                );
                if (addr == _create3Address) {
                    return referenceName;
                }
            }
        }
        revert("Sphinx: No reference name found for the given address. Should never happen.");
    }
}
