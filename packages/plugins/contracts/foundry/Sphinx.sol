// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { VmSafe, Vm } from "sphinx-forge-std/Vm.sol";
import { console } from "sphinx-forge-std/console.sol";

import {
    ISphinxAccessControl
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAccessControl.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxCreate3 } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxCreate3.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import {
    ISphinxAuthFactory
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import {
    Version,
    DeploymentStatus,
    RawSphinxAction,
    SphinxActionType,
    AuthLeafType
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    DeploymentState
} from "@sphinx-labs/contracts/contracts/SphinxModule.sol";
import {
    BundledSphinxAction,
    SphinxTarget,
    BundledSphinxTarget,
    SphinxBundle,
    HumanReadableAction,
    Network,
    ProposalOutput,
    SphinxConfig,
    InitialChainState,
    DeploymentInfo,
    BundledAuthLeaf,
    SphinxMode,
    NetworkInfo,
    OptionalAddress,
    Wallet,
    Label,
    BundledSphinxLeaf
} from "./SphinxPluginTypes.sol";
import { SphinxCollector } from "./SphinxCollector.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { ISphinxSemver } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxSemver.sol";

/**
 * @notice An abstract contract that the user must inherit in order to deploy with Sphinx.
 *         The main user-facing element of this contract is the `sphinx` modifier, which
 *         the user must include in their `run()` function. The rest of the logic is used
 *         internally by Sphinx to handle the process of collecting the user's contract
 *         deployments and function calls, as well as simulating and executing the deployment
 *         locally.
 *
 *         Functions in this contract are prefixed with "sphinx" to avoid name collisions with
 *         functions that the user defines in derived contracts. This applies to private functions
 *         too, since the compiler doesn't allow you to define a private function with the same
 *         signature in a parent contract and a child contract. This also applies to any state
 *         variables that aren't private. Private variables of the same name can be defined in a
 *         parent and child contract.
 */
abstract contract Sphinx {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /**
     * @dev The configuration options for the user's project. This variable must have `internal`
     *      visibility so that the user can set fields on it.
     */
    SphinxConfig internal sphinxConfig;

    Label[] private labels;

    SphinxConstants private constants;

    SphinxUtils private sphinxUtils;

    SphinxMode private sphinxMode;

    bool private sphinxModifierEnabled;

    constructor() {
        // Set the default SphinxManager version
        sphinxConfig.version = Version({ major: 0, minor: 2, patch: 6 });

        sphinxUtils = new SphinxUtils();
        constants = new SphinxConstants();
        // This ensures that these contracts stay deployed in a multi-fork environment (e.g. when
        // calling `vm.createSelectFork`).
        vm.makePersistent(address(constants));
        vm.makePersistent(address(sphinxUtils));
    }

    function sphinxCollectProposal(
        address _proposer,
        string memory _networkName,
        string memory _deploymentInfoPath
    ) external {
        string memory rpcUrl = vm.rpcUrl(_networkName);
        sphinxUtils.validateProposal(_proposer, _networkName, sphinxConfig);

        DeploymentInfo memory deploymentInfo = sphinxCollect(sphinxUtils.isLiveNetworkFFI(rpcUrl));

        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxCollectDeployment(
        string memory _networkName,
        string memory _deploymentInfoPath
    ) external {
        string memory rpcUrl = vm.rpcUrl(_networkName);

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        if (isLiveNetwork) {
            uint256 privateKey = vm.envOr("PRIVATE_KEY", uint256(0));
            require(
                privateKey != 0,
                "Sphinx: You must set the 'PRIVATE_KEY' environment variable to run the deployment."
            );

            address deployer = vm.addr(privateKey);

            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, deployer);

            // Make the deployer a proposer. If we don't do this, the execution logic will fail
            // because a proposer's meta transaction signature is required for the
            // `SphinxAuth.propose` function.
            sphinxConfig.proposers.push(deployer);
        } else {
            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            uint256 privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);
            address deployer = vm.addr(privateKey);

            // Make a pre-determined address a proposer. We'll use it later to sign a meta
            // transaction, which allows us to propose the deployment.
            sphinxConfig.proposers.push(deployer);
        }

        DeploymentInfo memory deploymentInfo = sphinxCollect(isLiveNetwork);
        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxCollect(bool _isLiveNetwork) private returns (DeploymentInfo memory) {
        ISphinxAuth auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig));
        ISphinxManager manager = ISphinxManager(sphinxManager());

        DeploymentInfo memory deploymentInfo;
        deploymentInfo.authAddress = address(auth);
        deploymentInfo.managerAddress = address(manager);
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.newConfig = sphinxConfig;
        deploymentInfo.isLiveNetwork = _isLiveNetwork;
        deploymentInfo.initialState = sphinxUtils.getInitialChainState(auth, manager);

        sphinxMode = SphinxMode.Collect;
        vm.startBroadcast(address(manager));
        run();
        vm.stopBroadcast();

        // Set the labels. We do this after running the user's script because the user may assign
        // labels in their deployment.
        deploymentInfo.labels = labels;

        return deploymentInfo;
    }

    /**
     * @notice Broadcasts a deployment. Meant to be called in the `sphinx deploy` CLI command.
     */
    function sphinxDeployTask(
        string memory _networkName,
        bytes32 _root,
        SphinxBundle memory _bundle
    ) external {
        string memory rpcUrl = vm.rpcUrl(_networkName);

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        uint256 privateKey;
        if (isLiveNetwork) {
            sphinxMode = SphinxMode.LiveNetworkBroadcast;

            privateKey = vm.envOr("PRIVATE_KEY", uint256(0));

            address deployer = vm.addr(privateKey);

            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, deployer);
        } else {
            sphinxMode = SphinxMode.LocalNetworkBroadcast;

            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);

            address deployer = vm.addr(privateKey);
            sphinxUtils.initializeFFI(rpcUrl, OptionalAddress({ exists: true, value: deployer }));
        }

        bytes memory metaTxnSignature = sphinxUtils.signMetaTxnForAuthRoot(privateKey, _root);

        vm.startBroadcast(privateKey);
        sphinxDeployOnNetwork(
            SphinxModule(sphinxModule()),
            _root,
            _bundle,
            metaTxnSignature,
            rpcUrl,
            _networkName
        );
        vm.stopBroadcast();
    }

    /**
     * @notice A helper function used by the Sphinx devs during testing to hook into the proposal
     *         proposal process to do environment setup. Not intended to be used by users.
     */
    function setupPropose() internal virtual {}

    // TODO - proposals
    // function sphinxSimulateProposal(
    //     bool _testnets,
    //     bytes32 _authRoot,
    //     BundleInfo[] memory _bundleInfoArray
    // ) external returns (uint256[] memory) {
    //     setupPropose();

    //     uint256 proposerPrivateKey = vm.envUint("PROPOSER_PRIVATE_KEY");
    //     address proposer = vm.addr(proposerPrivateKey);
    //     bytes memory metaTxnSignature = sphinxUtils.signMetaTxnForAuthRoot(
    //         proposerPrivateKey,
    //         _authRoot
    //     );

    //     sphinxMode = SphinxMode.Proposal;

    //     Network[] memory networks = _testnets ? sphinxConfig.testnets : sphinxConfig.mainnets;
    //     uint256[] memory forkIds = new uint256[](networks.length);
    //     for (uint256 i = 0; i < networks.length; i++) {
    //         Network network = networks[i];
    //         NetworkInfo memory networkInfo = sphinxUtils.getNetworkInfo(network);
    //         string memory rpcUrl = vm.rpcUrl(networkInfo.name);

    //         // Create a fork of the target network. This automatically sets the `block.chainid` to
    //         // the target chain (e.g. 1 for ethereum mainnet).
    //         uint256 forkId = vm.createSelectFork(rpcUrl);
    //         forkIds[i] = forkId;

    //         // Initialize the Sphinx contracts. We don't call `sphinxUtils.initializeFFI` here
    //         // because we never broadcast the transactions onto the forked network. This is a
    //         // performance optimization.
    //         sphinxUtils.initializeSphinxContracts(
    //             OptionalAddress({ exists: true, value: proposer })
    //         );

    //         // We prank the proposer here so that the `CallerMode.msgSender` is the proposer's address.
    //         vm.startPrank(proposer);
    //         sphinxDeployOnNetwork(
    //             ISphinxManager(sphinxManager()),
    //             ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig)),
    //             _authRoot,
    //             _bundleInfoArray[i],
    //             metaTxnSignature,
    //             rpcUrl
    //         );
    //         vm.stopPrank();
    //     }

    //     return forkIds;
    // }

    function sphinxRegisterProject(string memory _rpcUrl, address _msgSender) private {
        address[] memory sortedOwners = sphinxUtils.sortAddresses(sphinxConfig.owners);

        address safeAddress = sphinxModule();

        if (!safeAddress.code) {
            if (sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                vm.stopBroadcast();

                sphinxUtils.sphinxModuleFactoryDeploy(
                    sortedOwners,
                    sphinxConfig.threshold
                );

                // Call the `SphinxModuleFactory.deploySphinxModuleAndSafeProxy` function via FFI.
                sphinxUtils.sphinxModuleFactoryDeployFFI(
                    sortedOwners,
                    sphinxConfig.threshold,
                    _rpcUrl
                );

                vm.startBroadcast(_msgSender);
            } else {
                sphinxUtils.sphinxModuleFactoryDeploy(
                    sortedOwners,
                    sphinxConfig.threshold
                );
            }
        }
    }

    /**
     * @notice Helper function for executing a list of actions in batches.
     */
    function sphinxExecuteBatchActions(
        SphinxModule _module,
        BundledSphinxLeaf[] memory _leafs,
        uint _bufferedGasLimit
    ) private returns (bool, uint) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = _manager.activeDeploymentId();
        DeploymentState memory state = _manager.deployments(activeDeploymentId);

        BundledSphinxLeaf[] memory filteredLeafs = sphinxUtils.removeExecutedActions(
            bundledActions,
            state.actionsExecuted
        );

        // We can return early if there are no actions to execute.
        if (filteredLeafs.length == 0) {
            return (true, 0);
        }

        // The first leaf is always the auth leaf which we execute separately
        uint executed = 1;
        while (executed < filteredLeafs.length) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint batchSize = sphinxUtils.findMaxBatchSize(
                sphinxUtils.inefficientSlice(filteredLeafs, executed, filteredLeafs.length),
                _bufferedGasLimit - ((_bufferedGasLimit) * 20) / 100
            );
            BundledSphinxLeaf[] memory batch = sphinxUtils.inefficientSlice(
                filteredLeafs,
                executed,
                executed + batchSize
            );

            (RawSphinxAction[] memory rawActions, bytes32[][] memory _proofs) = sphinxUtils
                .disassembleActions(batch);

            // Execute the batch of actions.
            if (isSetStorageActionArray) {
                _manager.setStorage{ gas: _bufferedGasLimit }(rawActions, _proofs);
            } else {
                // We use a low-level call here to capture the returned error message, which
                // we use to retrieve the index of the failed action. This allows us to display
                // a nice error message to the user.
                (bool success, bytes memory result) = address(_manager).call{
                    gas: _bufferedGasLimit
                }(
                    // `abi.encodeCall` provides better type support than `abi.encodeWithSelector`, but
                    // we can't use it here because it isn't supported in Solidity v0.8.0, which is the
                    // earliest version we support.
                    abi.encodeWithSelector(
                        ISphinxManager.executeInitialActions.selector,
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
            state = _manager.deployments(activeDeploymentId);
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
        SphinxModule _module,
        SphinxBundle memory _bundle,
        uint256 blockGasLimit,
        bytes[] memory _signatures
    ) private returns (bool, HumanReadableAction memory) {
        // Define an empty action, which we'll return if the deployment succeeds.
        HumanReadableAction memory emptyAction;

        BundledSphinxLeaf[] memory leafs = _bundle.leafs;

        // The auth leaf is always first
        BundledSphinxLeaf authLeaf = _bundle.leaf[0];

        // Execute auth leaf
        _module.approve{ gas: 1000000 }(_bundle.root, authLeaf, authLeaf.proof, _signatures);

        // Execute the rest of the actions
        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        (bool status, uint failedActionIndex) = sphinxExecuteBatchActions(
            _module,
            leafs,
            bufferedGasLimit
        );

        // Return with the relevant human readable action if the deployment failed
        // TODO - do something to make human readable actions available?
        if (status == false) {
            return (false, HumanReadableAction("unknown", 0, SphinxActionType.CALL));
        }

        return (true, emptyAction);
    }

    /**
     * @notice A modifier that the user must include on their `run()` function when using Sphinx.
     *         This modifier mainly performs validation on the user's configuration and environment.
     */
    modifier sphinx() {
        sphinxModifierEnabled = true;

        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        require(
            callerMode != VmSafe.CallerMode.Broadcast,
            "Sphinx: You must broadcast deployments using the 'sphinx deploy' CLI command."
        );
        require(
            callerMode != VmSafe.CallerMode.RecurrentBroadcast || sphinxMode == SphinxMode.Collect,
            "Sphinx: You must broadcast deployments using the 'sphinx deploy' CLI command."
        );
        require(
            callerMode != VmSafe.CallerMode.Prank,
            "Sphinx: Cannot call Sphinx using vm.prank. Please use vm.startPrank instead."
        );

        // We allow users to call `vm.startPrank` before calling their `deploy` function so that
        // they don't need to toggle it before and after calling `deploy`, which may be annoying for
        // users who have complex deployment flows. However, we turn pranking off here because we'll
        // prank the SphinxManager during the execution process, since this is the contract that
        // deploys their contracts on live networks. If the user enabled pranking before calling
        // `deploy`, then we'll turn it back on at the end of this modifier.
        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();

        sphinxUtils.validate(sphinxConfig);

        if (sphinxMode == SphinxMode.Collect) {
            // Execute the user's 'run()' function.
            _;
        } else if (sphinxMode == SphinxMode.Default) {
            ISphinxManager manager = ISphinxManager(sphinxManager());

            // Prank the SphinxManager then execute the user's `run()` function. We prank
            // the SphinxManager to replicate the deployment process on live networks.
            vm.startPrank(address(manager));
            _;
            vm.stopPrank();
        }

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);

        sphinxModifierEnabled = false;
    }

    /**
     * @notice Runs the production deployment process. We use this to broadcast transactions
     *         when the user is deploying with the CLI, and we use this when simulating the
     *         deployment before submitting a proposal.
     *
     *         If you examine the function calls in this contract that execute the deployment
     *         process, you'll notice that there's a hard-coded `gas` value for each one. This does
     *         not impact the amount of gas actually used in these transactions. We need to
     *         hard-code these values to avoid an edge case that occurs when deploying against an
     *         Anvil node. In particular, Foundry will fail to detect that the pre-deployed Sphinx
     *         contracts are already deployed on the network. This weird behavior happens because we
     *         deploy the Sphinx predeploys via FFI (in `SphinxUtils.initializeFFI`). Since it
     *         doesn't detect that these contracts exist, it will use a very low gas amount for the
     *         deployment transactions, since it expects them to fail. This causes the entire
     *         deployment to fail.
     */
    function sphinxDeployOnNetwork(
        SphinxModule _module,
        bytes32 _root,
        SphinxBundle memory _bundle,
        bytes memory _metaTxnSignature,
        string memory _rpcUrl,
        string memory _networkName
    ) private {
        (, address msgSender, ) = vm.readCallers();

        if (_bundle.leafs.length == 0) {
            console.log(
                string(
                    abi.encodePacked(
                        "Sphinx: Nothing to execute on ",
                        _networkName,
                        ". Exiting early."
                    )
                )
            );
            return;
        }

        sphinxRegisterProject(_rpcUrl, msgSender);

        DeploymentState memory deploymentState = _module.deployments(_root);

        if (deploymentState.numLeafs == deploymentState.leafsExecuted) {
            console.log(
                string(
                    abi.encodePacked(
                        "Sphinx: Deployment was already completed on ",
                        _bundleInfo.networkName,
                        ". Exiting early."
                    )
                )
            );
            return;
        }

        bytes[] memory ownerSignatureArray;
        if (sphinxMode == SphinxMode.LiveNetworkBroadcast) {
            ownerSignatureArray = new bytes[](1);
            ownerSignatureArray[0] = _metaTxnSignature;
        } else if (
            sphinxMode == SphinxMode.LocalNetworkBroadcast || sphinxMode == SphinxMode.Proposal
        ) {
            uint256 currentOwnerThreshold = _auth.threshold();
            ownerSignatureArray = new bytes[](currentOwnerThreshold);

            Wallet[] memory wallets = sphinxUtils.getSphinxWalletsSortedByAddress(
                currentOwnerThreshold
            );
            for (uint256 i = 0; i < currentOwnerThreshold; i++) {
                // Create a list of owner meta transactions. This allows us to run the rest of
                // this function without needing to know the owner private keys. If we don't do
                // this, the rest of this function will fail because there are an insufficent
                // number of owner signatures. It's worth mentioning that another strategy is to
                // set the owner threshold to 0 via `vm.store`, but we do it this way because it
                // allows us to run the meta transaction signature verification logic in the
                // SphinxAuth contract instead of skipping it entirely, which would be the case
                // if we set the owner threshold to 0.
                _sphinxGrantRoleInAuthContract(bytes32(0), wallets[i].addr, _rpcUrl);
                ownerSignatureArray[i] = sphinxUtils.signMetaTxnForAuthRoot(
                    wallets[i].privateKey,
                    _authRoot
                );
            }
        }

        (
            bool executionSuccess,
            HumanReadableAction memory readableAction
        ) = sphinxExecuteDeployment(_manager, _bundleInfo, block.gaslimit);

        if (!executionSuccess) {
            bytes memory revertMessage = abi.encodePacked(
                "Sphinx: failed to execute deployment because the following action reverted: ",
                readableAction.reason
            );

            revert(string(revertMessage));
        }

        // For reference, subitting the signed leafs
        // (, uint256 leafsExecuted, ) = _auth.authStates(_authRoot);
        // for (uint i = 0; i < _bundleInfo.authLeafs.length; i++) {
        //     BundledAuthLeaf memory leaf = _bundleInfo.authLeafs[i];

        //     if (leafsExecuted > leaf.leaf.index) {
        //         continue;
        //     }

        //     if (leaf.leafTypeEnum == AuthLeafType.SETUP) {
        //         _auth.setup{ gas: 3000000 }(
        //             _authRoot,
        //             leaf.leaf,
        //             ownerSignatureArray,
        //             leaf.proof
        //         );
        //     } else if (leaf.leafTypeEnum == AuthLeafType.PROPOSE) {
        //         if (sphinxMode == SphinxMode.LiveNetworkBroadcast) {
        //             _auth.propose{ gas: 1000000 }(
        //                 _authRoot,
        //                 leaf.leaf,
        //                 ownerSignatureArray,
        //                 leaf.proof
        //             );
        //         } else if (
        //             sphinxMode == SphinxMode.Proposal ||
        //             sphinxMode == SphinxMode.LocalNetworkBroadcast
        //         ) {
        //             _sphinxGrantRoleInAuthContract(
        //                 keccak256("ProposerRole"),
        //                 msgSender,
        //                 _rpcUrl
        //             );

        //             bytes[] memory proposerSignatureArray = new bytes[](1);
        //             proposerSignatureArray[0] = _metaTxnSignature;

        //             _auth.propose{ gas: 1000000 }(
        //                 _authRoot,
        //                 leaf.leaf,
        //                 proposerSignatureArray,
        //                 leaf.proof
        //             );
        //         }
        //     } else if (leaf.leafTypeEnum == AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL) {
        //         _auth.upgradeManagerAndAuthImpl{ gas: 1000000 }(
        //             _authRoot,
        //             leaf.leaf,
        //             ownerSignatureArray,
        //             leaf.proof
        //         );
        //     } else if (leaf.leafTypeEnum == AuthLeafType.APPROVE_DEPLOYMENT) {
        //         _auth.approveDeployment{ gas: 1000000 }(
        //             _authRoot,
        //             leaf.leaf,
        //             ownerSignatureArray,
        //             leaf.proof
        //         );
        //         deploymentState.status = DeploymentStatus.APPROVED;
        //     } else if (leaf.leafTypeEnum == AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT) {
        //         _auth.cancelActiveDeployment{ gas: 1000000 }(
        //             _authRoot,
        //             leaf.leaf,
        //             ownerSignatureArray,
        //             leaf.proof
        //         );
        //     } else {
        //         revert("Unsupported auth leaf type. Should never happen.");
        //     }
        // }
    }

    function run() public virtual;

    /**
     * @notice Deploys a contract at the expected CREATE3 address. Only called through the
     *         SphinxClient, which is currently unused.
     *
     * @param _referenceName     The reference name of the contract to deploy. Used to generate the
       contracts address.
     * @param _userSalt          The user's salt. Used to generate the contracts address.
     * @param _constructorArgs   The constructor arguments for the contract.
     * @param fullyQualifiedName The fully qualified name of the contract to deploy.
     * @param artifactPath       The path to the artifact for the actual contract to deploy.
     */
    function _sphinxDeployContract(
        string memory _referenceName,
        bytes32 _userSalt,
        bytes memory _constructorArgs,
        string memory fullyQualifiedName,
        string memory artifactPath
    ) internal returns (address) {
        require(
            sphinxModifierEnabled,
            "Sphinx: You must include the 'sphinx' modifier on your run function."
        );

        address manager = sphinxManager();
        // We use brackets here to prevent a "Stack too deep" Solidity compiler error.
        {
            (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
            // Check that we're currently pranking/broadcasting from the SphinxManager. This should
            // always be true unless the user deliberately cancels the prank/broadcast in their 'deploy'
            // function.
            if (sphinxMode == SphinxMode.Collect) {
                require(
                    callerMode == VmSafe.CallerMode.RecurrentBroadcast && msgSender == manager,
                    "Sphinx: You must not use any prank or broadcast cheatcodes in your deployment."
                );
            } else {
                require(
                    callerMode == VmSafe.CallerMode.RecurrentPrank && msgSender == manager,
                    "Sphinx: You must not use any prank or broadcast cheatcodes in your deployment."
                );
            }
        }

        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        address create3Address = sphinxUtils.computeCreate3Address(manager, create3Salt);

        require(
            create3Address.code.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Contract already exists at the CREATE3 address. Please use a different salt or reference name to deploy ",
                    fullyQualifiedName,
                    " at a different address."
                )
            )
        );

        // Deploy the user's contract to the CREATE3 address via the SphinxCollector, which exists
        // at the SphinxManager's address. This mirrors what happens on live networks.
        SphinxCollector(manager).deploy({
            fullyQualifiedName: fullyQualifiedName,
            initCode: vm.getCode(artifactPath),
            constructorArgs: _constructorArgs,
            userSalt: _userSalt,
            referenceName: _referenceName
        });

        return create3Address;
    }

    /**
     * @notice Grant a role to an account in the SphinxAuth contract. This is meant to be called
     *         when running against local networks. It is not used as part of the live network
     *         execution process. Its purpose on local networks is to make projects executable
     *         even if the private keys of the owners are not known. It's worth mentioning that
     *         we define this function in this contract instead of in `SphinxUtils` because it
     *         involves an external call, which increases the number of transactions broadcasted
     *         against local networks, making it difficult to test that no unnecessary transactions
     *         are being broadcasted.
     */
    function _sphinxGrantRoleInAuthContract(
        bytes32 _role,
        address _account,
        string memory _rpcUrl
    ) private {
        address auth = sphinxUtils.getSphinxAuthAddress(sphinxConfig);
        if (!ISphinxAccessControl(address(auth)).hasRole(_role, _account)) {
            bytes32 roleSlotKey = sphinxUtils.getMappingValueSlotKey(
                constants.authAccessControlRoleSlotKey(),
                _role
            );
            bytes32 memberSlotKey = sphinxUtils.getMappingValueSlotKey(
                roleSlotKey,
                bytes32(uint256(uint160(_account)))
            );
            vm.store(address(auth), memberSlotKey, bytes32(uint256(1)));

            if (sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                string[] memory inputs = new string[](8);
                inputs[0] = "cast";
                inputs[1] = "rpc";
                inputs[2] = "--rpc-url";
                inputs[3] = _rpcUrl;
                // We use the 'hardhat_setStorageAt' RPC method here because it works on Anvil and
                // Hardhat nodes, whereas 'hardhat_setStorageAt' only works on Anvil nodes.
                inputs[4] = "hardhat_setStorageAt";
                inputs[5] = vm.toString(address(auth));
                inputs[6] = vm.toString(memberSlotKey);
                inputs[7] = vm.toString(bytes32(uint256(1)));
                Vm.FfiResult memory result = vm.tryFfi(inputs);
                if (result.exitCode != 0) {
                    revert(string(result.stderr));
                }
            }
        }
    }

    /**
     * @notice Get the address of the SphinxModule. Before calling this function, the following
     *         values in the SphinxConfig must be set: `owners`, `threshold`, and `projectName`.
     */
    function sphinxModule() public view returns (address) {
        return sphinxUtils.getSphinxSafeAddress(sphinxConfig.owners, sphinxConfig.threshold);
    }

    function getSphinxNetwork(uint256 _chainId) public view returns (Network) {
        NetworkInfo[] memory all = sphinxUtils.getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].chainId == _chainId) {
                return all[i].network;
            }
        }
        revert(
            string(abi.encodePacked("No network found with the chain ID: ", vm.toString(_chainId)))
        );
    }

    function sphinxLabel(address _addr, string memory _fullyQualifiedName) internal {
        for (uint256 i = 0; i < labels.length; i++) {
            Label memory label = labels[i];
            if (label.addr == _addr) {
                require(
                    keccak256(abi.encodePacked(_fullyQualifiedName)) ==
                        keccak256(abi.encodePacked(label.fullyQualifiedName)),
                    string(
                        abi.encodePacked(
                            "Sphinx: The address ",
                            vm.toString(_addr),
                            " was labeled with two names:\n",
                            label.fullyQualifiedName,
                            "\n",
                            _fullyQualifiedName,
                            "\nPlease choose one label."
                        )
                    )
                );
                return;
            }
        }

        labels.push(Label(_addr, _fullyQualifiedName));
    }

    function sphinxConfigNetworks() external view returns (Network[] memory, Network[] memory) {
        return (sphinxConfig.testnets, sphinxConfig.mainnets);
    }
}
