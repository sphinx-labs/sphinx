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
    ProposalOutput,
    SphinxConfig,
    BundleInfo,
    InitialChainState,
    DeploymentInfo,
    BundledAuthLeaf,
    SphinxMode,
    NetworkInfo,
    OptionalAddress,
    Wallet
} from "./SphinxPluginTypes.sol";
import { SphinxCollector } from "./SphinxCollector.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { ISphinxSemver } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxSemver.sol";

// keep3r integration:
// - TODO(md): see the client spec in linear for things to include in client docs
// - TODO(md): `computeCreateAddress` example
// - TODO(md): gas report results in higher values for all function calls in the `deploy` function.
//   the reported contract deployment costs are identical to the actual deployment costs. the gas
//   report for anything outside of the `deploy` function is unchanged, even when interacting with
//   contracts deployed by sphinx.

// - TODO(ask): ask keep3r if it matters that the gas report breaks

/**
 * @notice An abstract contract that the user must inherit in order to execute deployments using
 *         Sphinx. This contract handle the process of collecting the user's actions (i.e. contract
 *         deployments and function calls), then converts these into a format that can be executed
 *         on-chain, and, lastly, it executes the deployment on the user's contracts.
 *
 *         Functions in this contract are prefixed with "sphinx" to avoid name collisions with
 *         functions that the user defines in derived contracts. This applies to private functions
 *         too, since the compiler doesn't allow you to define a private function with the same
 *         signature in a parent contract and a child contract. This also applies to any state
 *         variables that aren't private. Private variables of the same name can be defined in a
 *         parent and child contract.
 *
 *         If you examine the function calls in this contract that execute the deployment process,
 *         you'll notice that there's a hard-coded `gas` value for each one. This does not impact
 *         the amount of gas actually used in these transactions. We need to hard-code these values
 *         to avoid an edge case that occurs when deploying against an Anvil node. In particular,
 *         Foundry will fail to detect that the pre-deployed Sphinx contracts are already deployed
 *         on the network, which occurs because we deploy them via FFI (in
 *         `SphinxUtils.initializeFFI`). Since it doesn't detect that these contracts exist, it will
 *         use a very low gas amount for the deployment transactions, since it expects them to fail.
 *         This causes the entire deployment to fail.
 */
abstract contract Sphinx {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    DeploymentInfo private deploymentInfo;

    string[] referenceNames;

    SphinxConstants private constants;

    /**
     * @dev The configuration options for the user's project. This variable must have `internal`
     *         visibility so that the user can set fields on it in their constructor.
     */
    SphinxConfig internal sphinxConfig;

    SphinxUtils private sphinxUtils;

    // TODO(md): it may be surprising to the user if a previously deployed contract (with
    // different bytecode or a different abi) is returned from a "deploy<Contract>" call instead of
    // their new contract. consider changing the name of the deploy function to "ensureDeployed" or
    // something, or just explain that this is how the tool works.

    // TODO(md): perhaps add to faq that users can use `computeCreateAddress` from `StdUtils.sol`.
    // if you include this, say that the initial nonce is *1*, not 0. see eip-161:
    // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-161.md#specification

    SphinxMode public sphinxMode;
    bool public sphinxModifierEnabled;

    // TODO(md): This is outdated. We don't require the user to call the constructor of Sphinx.sol
    // anymore, so I don't think it doesn't make much sense to include this here. I think we should
    // move everything in @notice to our docs.
    /**
     * @notice We expect that the user will inherit from this contract in their Sphinx script. When they do so, they'll
     *         also be required to call this constructor with their configuration options.
     *
     *         Required for every deployment:
     *          - string projectName:  The name of the project, e.g. "My Project". One of the fields contract addresses.
     *          - address[] owners:    The addresses of the owners of the project, e.g. [0x123..., 0x456...], impacts contract addresses.
     *          - uint256 threshold:   The number of owners required to approve a deployment, e.g. 1.
     *
     *         Required when using the DevOps platform:
     *          - string orgId:        The ID of the organization, e.g. "12345", required to interact with the DevOps platform.
     *          - address[] proposers: The addresses of the proposers of the project, e.g. [0x123..., 0x456...], required to propose deployments.
     *                                 If there is no proposer defined and only one owner, then we use the owner as the proposer.
     *          - Network[] mainnets:  The mainnet networks to deploy to, e.g. [Network.ethereum, Network.optimism, Network.arbitrum].
     *          - Network[] testnets:  The testnet networks to deploy to, e.g. [Network.goerli, Network.optimism_goerli, Network.arbitrum_goerli].
     */
    constructor() {
        // Set default values for the SphinxConfig
        sphinxConfig.version = Version({ major: 0, minor: 2, patch: 6 });

        sphinxUtils = new SphinxUtils();
        constants = new SphinxConstants();
        // This ensures that these contracts stay deployed in a multi-fork environment (e.g. when
        // calling `vm.createSelectFork`).
        vm.makePersistent(address(constants));
        vm.makePersistent(address(sphinxUtils));
    }

    function sphinxCollectProposal(address _proposer, bool _testnets, string memory _proposalNetworksPath) external {
        Network[] memory networks = _testnets ? sphinxConfig.testnets : sphinxConfig.mainnets;
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

        string memory allNetworkNames;
        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];

            string memory networkName = sphinxUtils.getNetworkInfo(network).name;
            string memory rpcUrl = vm.rpcUrl(networkName);

            // Create a fork of the target network. This automatically sets the `block.chainid` to
            // the target chain (e.g. 1 for ethereum mainnet).
            vm.createSelectFork(rpcUrl);

            sphinxUtils.validateProposal(_proposer, network, sphinxConfig);
            sphinxCollect(networkName, sphinxUtils.isLiveNetworkFFI(rpcUrl));

            // Concatenate the network names, adding a comma except after the last name.
            allNetworkNames = string(abi.encodePacked(allNetworkNames, networkName));
            if (i < networks.length - 1) {
                // If it's not the last network name, append a comma.
                allNetworkNames = string(abi.encodePacked(allNetworkNames, ","));
            }
        }

        vm.writeFile(_proposalNetworksPath, allNetworkNames);
    }

    function sphinxCollectDeployment(string memory _networkName) private {
        string memory rpcUrl = vm.rpcUrl(_networkName);

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        uint256 privateKey;
        if (isLiveNetwork) {
            privateKey = vm.envOr("PRIVATE_KEY", uint256(0));
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
            privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);

            address deployer = vm.addr(privateKey);
            sphinxUtils.initializeFFI(
                rpcUrl,
                OptionalAddress({ exists: true, value: deployer })
            );

            // Make a pre-determined address a proposer. We'll use it later to sign a meta
            // transaction, which allows us to propose the deployment.
            sphinxConfig.proposers.push(deployer);
        }

        sphinxCollect(_networkName, isLiveNetwork);
    }

    function sphinxCollect(string memory _networkName, bool _isLiveNetwork) private {
        ISphinxAuth auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig));
        ISphinxManager manager = ISphinxManager(sphinxManager(sphinxConfig));

        deploymentInfo = DeploymentInfo({
            authAddress: address(auth),
            managerAddress: address(manager),
            chainId: block.chainid,
            newConfig: sphinxConfig,
            isLiveNetwork: _isLiveNetwork,
            initialState: sphinxUtils.getInitialChainState(auth, manager)
        });

        // Set the LocalSphinxManager to the SphinxManager's address. We'll use this when
        // collecting the actions. This call will be undone when we revert the snapshot.
        vm.etch(address(manager), type(SphinxCollector).runtimeCode);

        Network network = sphinxUtils.findNetworkInfoByName(_networkName).network;
        sphinxMode = SphinxMode.Collect;
        vm.startBroadcast(address(manager));
        SphinxCollector(address(manager)).collectDeploymentInfo(deploymentInfo);
        deploy(network);
        vm.stopBroadcast();
    }

// TODO: when adding support for initiating broadcasts within a forge script instead of the `sphinx
// deploy` command:
// The reason we didn't include this ability is because the user's `deploy`
// function is erased due to `vm.revertTo(...)`. if the user assigns a contract state variable to a
// value inside the deploy function, then their deploy function will be executed, but the state
// variable will remain unassigned after the `deploy` function is executed. (to be clear, it's
// assigned in the sphinx modifier, then undone when `vm.revertTo` is called). a solution is to run
// the user's deploy function twice. on the second run, we'd need to be in "assign" mode, i.e. just
// assign addresses when the user calls 'deploy' and 'define'. this is easy to implement, but
// unfortunately, if a user console.logs in their `deploy` function, then the log will appear twice
// due to the fact that we run the deploy function twice. this would be confusing to the user, so i
// just decided to disable to the broadcasting feature and move on.

    /**
     * @notice Called within the `sphinx deploy` CLI command. This function is not meant to be
     *         called directly by the user. If a user wants to broadcast a deployment, they should
     *         use the `sphinx deploy` CLI command instead of calling this function.
     *
     *         This function serves two purposes:
     *         1. When it's called without the `--broadcast` flag, it simulates a deployment and
     *            writes the `DeploymentInfo` struct to the filesystem, which the `sphinx deploy`
     *            command uses to display a preview of the deployment to the user.
     *         2. When it's called with the `--broadcast` flag, it deploys the user's contracts to
     *            the specified network. It also writes the `DeploymentInfo` struct to the
     *            filesystem, which is used to write deployment artifacts to the filesystem.
     */
    function sphinxDeployTask(
        string memory _networkName,
        bytes32 _authRoot,
        BundleInfo memory _bundleInfo
    ) external {
        string memory rpcUrl = vm.rpcUrl(_networkName);

        // TODO(refactor): i think you can remove most/all of the stuff below
        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        uint256 privateKey;
        if (isLiveNetwork) {
            sphinxMode = SphinxMode.LiveNetworkBroadcast;

            privateKey = vm.envOr("PRIVATE_KEY", uint256(0));
            require(
                privateKey != 0,
                "Sphinx: You must set the 'PRIVATE_KEY' environment variable to run the deployment."
            );

            address deployer = vm.addr(privateKey);

            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, deployer);
        } else {
            sphinxMode = SphinxMode.LocalNetworkBroadcast;

            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);

            address deployer = vm.addr(privateKey);
            sphinxUtils.initializeFFI(
                rpcUrl,
                OptionalAddress({ exists: true, value: deployer })
            );
        }

        // TODO: c/f broadcast

        // TODO(refactor): remove getBundleInfoFFI from sphinxutils?

        // TODO(refactor): clean up this function. e.g. we query the private key twice.

        uint256 deployerPrivateKey = isLiveNetwork
            ? vm.envUint("PRIVATE_KEY")
            : sphinxUtils.getSphinxDeployerPrivateKey(0);
        bytes memory metaTxnSignature = sphinxUtils.signMetaTxnForAuthRoot(
            deployerPrivateKey,
           _authRoot
        );

        vm.startBroadcast(privateKey);
        sphinxDeployOnNetwork(ISphinxManager(sphinxManager(sphinxConfig)), ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig)), _authRoot, _bundleInfo, metaTxnSignature, rpcUrl);
        vm.stopBroadcast();
    }

    /**
     * @notice A helper function used by the Sphinx devs during testing to hook into the proposal
     *         proposal process to do environment setup. Not intended to be used by users.
     */
    function setupPropose() internal virtual {}

    function sphinxSimulateProposal(
        bool _testnets,
        bytes32 _authRoot,
        BundleInfo[] memory _bundleInfoArray
    ) external returns (uint256[] memory) {
        setupPropose();

        uint256 proposerPrivateKey = vm.envUint("PROPOSER_PRIVATE_KEY");
        address proposer = vm.addr(proposerPrivateKey);
        bytes memory metaTxnSignature = sphinxUtils.signMetaTxnForAuthRoot(
            proposerPrivateKey,
            _authRoot
        );

        sphinxMode = SphinxMode.Proposal;

        Network[] memory networks = _testnets ? sphinxConfig.testnets : sphinxConfig.mainnets;
        uint256[] memory forkIds = new uint256[](networks.length);
        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];
            NetworkInfo memory networkInfo = sphinxUtils.getNetworkInfo(network);
            string memory rpcUrl = vm.rpcUrl(networkInfo.name);

            // Create a fork of the target network. This automatically sets the `block.chainid` to
            // the target chain (e.g. 1 for ethereum mainnet).
            uint256 forkId = vm.createSelectFork(rpcUrl);
            forkIds[i] = forkId;

            // Initialize the Sphinx contracts. We don't call `sphinxUtils.initializeFFI` here
            // because we never broadcast the transactions onto the forked network. This is a
            // performance optimization.
            sphinxUtils.initializeSphinxContracts(
                OptionalAddress({ exists: true, value: proposer })
            );

            // We prank the proposer here so that the `msgSender` is the proposer's address, which
            // we use in TODO(docs).
            vm.startPrank(proposer);
            sphinxDeployOnNetwork(ISphinxManager(sphinxManager(sphinxConfig)), ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig)), _authRoot, _bundleInfoArray[i], metaTxnSignature, rpcUrl);
            vm.stopPrank();
        }

        return forkIds;
    }

    function sphinxRegisterProject(string memory _rpcUrl, address _msgSender) private {
        address[] memory sortedOwners = sphinxUtils.sortAddresses(sphinxConfig.owners);

        bytes memory authData = abi.encode(sortedOwners, sphinxConfig.threshold);

        ISphinxAuthFactory authFactory = ISphinxAuthFactory(constants.authFactoryAddress());
        bytes32 authSalt = keccak256(abi.encode(authData, sphinxConfig.projectName));
        bool isRegistered = address(authFactory.auths(authSalt)) != address(0);
        if (!isRegistered) {
            if (sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                vm.stopBroadcast();

                authFactory.deploy{ gas: 2000000 }(authData, hex"", sphinxConfig.projectName);
                // Call the `authFactory.deploy` function via FFI. See the docs of this
                // function call for more info.
                sphinxUtils.authFactoryDeployFFI(authData, sphinxConfig.projectName, _rpcUrl);

                vm.startBroadcast(_msgSender);
            } else {
                authFactory.deploy{ gas: 2000000 }(authData, hex"", sphinxConfig.projectName);
            }
        }
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function sphinxExecuteBatchActions(
        ISphinxManager _manager,
        BundledSphinxAction[] memory bundledActions,
        bool isSetStorageActionArray,
        uint bufferedGasLimit
    ) private returns (DeploymentStatus, uint) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = _manager.activeDeploymentId();
        DeploymentState memory state = _manager.deployments(activeDeploymentId);

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
                _manager.setStorage{ gas: bufferedGasLimit }(rawActions, _proofs);
            } else {
                // We use a low-level call here to capture the returned error message, which
                // we use to retrieve the index of the failed action. This allows us to display
                // a nice error message to the user.
                (bool success, bytes memory result) = address(_manager).call{
                    gas: bufferedGasLimit
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
        ISphinxManager _manager,
        BundleInfo memory bundleInfo,
        uint256 blockGasLimit
    ) private returns (bool, HumanReadableAction memory) {
        // Define an empty action, which we'll return if the deployment succeeds.
        HumanReadableAction memory emptyAction;

        (
            BundledSphinxAction[] memory initialActions,
            BundledSphinxAction[] memory setStorageActions
        ) = sphinxUtils.splitActions(bundleInfo.actionBundle.actions);

        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        // Execute all the deploy contract actions and exit early if the deployment failed
        (DeploymentStatus status, uint failedActionIndex) = sphinxExecuteBatchActions(
            _manager,
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
        _manager.initiateUpgrade{ gas: 1000000 }(targets, proofs);

        // Execute all the set storage actions
        sphinxExecuteBatchActions(_manager, setStorageActions, true, bufferedGasLimit);

        // Complete the upgrade
        _manager.finalizeUpgrade{ gas: 1000000 }(targets, proofs);

        return (true, emptyAction);
    }

    modifier sphinx(Network _network) {
        sphinxModifierEnabled = true;

        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        require(
            callerMode != VmSafe.CallerMode.Broadcast,
            "Sphinx: Cannot deploy using vm.broadcast. Please use a recurrent broadcast (vm.startBroadcast) instead."
        );
        require(
            callerMode != VmSafe.CallerMode.Prank,
            "Sphinx: Cannot deploy using vm.prank. Please use a recurrent prank (vm.startPrank) instead."
        );

        // We allow users to call `vm.startPrank` before calling their `deploy` function so that
        // they don't need to toggle it before and after calling `deploy`, which may be annoying for
        // users who have complex deployment flows. However, we turn pranking off here because we'll
        // prank the SphinxManager during the execution process, since this is the contract that
        // deploys their contracts on live networks. If the user enabled pranking before calling
        // `deploy`, then we'll turn it back on at the end of this modifier.
        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();

        delete deploymentInfo;
        delete referenceNames;

        ISphinxAuth auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig));
        ISphinxManager manager = ISphinxManager(sphinxManager(sphinxConfig));

        sphinxUtils.validate(sphinxConfig, _network);

        if (sphinxMode == SphinxMode.Collect) {
            _;
        } else if (sphinxMode == SphinxMode.Default) {
            vm.etch(address(manager), type(SphinxCollector).runtimeCode);

            vm.startPrank(address(manager));
            _;
            vm.stopPrank();
        }

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);

        sphinxModifierEnabled = false;
    }

    function sphinxDeployOnNetwork(
        ISphinxManager _manager,
        ISphinxAuth _auth,
        bytes32 _authRoot,
        BundleInfo memory _bundleInfo,
        bytes memory _metaTxnSignature,
        string memory _rpcUrl
    ) private {
        (, address msgSender, ) = vm.readCallers();

        if (_bundleInfo.authLeafs.length == 0) {
            console.log(
                string(
                    abi.encodePacked(
                        "Sphinx: Nothing to execute on ",
                        _bundleInfo.networkName,
                        ". Exiting early."
                    )
                )
            );
            return;
        }

        sphinxRegisterProject(_rpcUrl, msgSender);

        bytes32 deploymentId = sphinxUtils.getDeploymentId(
            _bundleInfo.actionBundle,
            _bundleInfo.targetBundle,
            _bundleInfo.configUri
        );
        DeploymentState memory deploymentState = _manager.deployments(deploymentId);

        if (deploymentState.status == DeploymentStatus.COMPLETED) {
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

        if (deploymentState.status == DeploymentStatus.EMPTY) {
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

            (, uint256 leafsExecuted, ) = _auth.authStates(_authRoot);
            for (uint i = 0; i < _bundleInfo.authLeafs.length; i++) {
                BundledAuthLeaf memory leaf = _bundleInfo.authLeafs[i];

                if (leafsExecuted > leaf.leaf.index) {
                    continue;
                }

                if (leaf.leafTypeEnum == AuthLeafType.SETUP) {
                    _auth.setup{ gas: 3000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafTypeEnum == AuthLeafType.PROPOSE) {
                    if (sphinxMode == SphinxMode.LiveNetworkBroadcast) {
                        _auth.propose{ gas: 1000000 }(
                            _authRoot,
                            leaf.leaf,
                            ownerSignatureArray,
                            leaf.proof
                        );
                    } else if (
                        sphinxMode == SphinxMode.Proposal ||
                        sphinxMode == SphinxMode.LocalNetworkBroadcast
                    ) {
                        _sphinxGrantRoleInAuthContract(
                            keccak256("ProposerRole"),
                            msgSender,
                            _rpcUrl
                        );

                        bytes[] memory proposerSignatureArray = new bytes[](1);
                        proposerSignatureArray[0] = _metaTxnSignature;

                        _auth.propose{ gas: 1000000 }(
                            _authRoot,
                            leaf.leaf,
                            proposerSignatureArray,
                            leaf.proof
                        );
                    }
                } else if (leaf.leafTypeEnum == AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL) {
                    _auth.upgradeManagerAndAuthImpl{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafTypeEnum == AuthLeafType.APPROVE_DEPLOYMENT) {
                    _auth.approveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                    deploymentState.status = DeploymentStatus.APPROVED;
                } else if (leaf.leafTypeEnum == AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT) {
                    _auth.cancelActiveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else {
                    revert("Unsupported auth leaf type. Should never happen.");
                }
            }
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED ||
            deploymentState.status == DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
        ) {
            if (
                sphinxMode == SphinxMode.Proposal || sphinxMode == SphinxMode.LocalNetworkBroadcast
            ) {
                // Claim the deployment. It's not necessary to call this function when broadcasting
                // on a live network because the user will be executing the deployment themselves.
                // To be more specific, `remoteExecution` will be set to false when broadcasting on
                // a live network, which allows us to skip this function call.
                _manager.claimDeployment{ gas: 1000000 }();
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
        }
    }

    function deploy(Network _network) public virtual;

// TODO(docs): everywhere in this contract

    /**
     * @notice Deploys a contract at the expected Sphinx address. Called from the auto generated Sphinx Client.
     *         To deploy contracts during the simulation phase.
     *
     *         We use a proxy pattern to allow the user to interact with their Client contracts while still accurately simulating
     *         the real functionality of their underlying contracts including their constructor logic and storage layout.
     *
     *         This function performs a three step process to setup this proxy pattern.
     *         1. Generate the CREATE3 address for the contract and deploy the contract to that address.
     *            This ensures the contract is deployed exactly as it would be on a live network.
     *         2. Etch the contract code to a separate implementation address which is the CREATE3 address minus one.
     *         3. Deploy the client code to the CREATE3 address with the implementation address as a constructor argument.
     *
     *         After this process is complete, the user can interact with their contract by calling functions on the client, and the
     *         client will delegate those calls to the implementation.
     *
     * @param _referenceName     The reference name of the contract to deploy. Used to generate the contracts address.
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
            "Sphinx: You must include the 'sphinx(Network)' modifier in your deploy function."
        );

        // TODO(docs): explain what the sphinx modifier does. particularly, it pranks/broadcasts
        // from the sphinx manager. explain why. (it's so that the msg.sender for function calls is
        // the same as it would be in a production deployment).

        // TODO(md): in the testing mode, we can't detect if users stop pranking their sphinx
        // manager and start pranking another address during the deployment. so, we should tell
        // users that they shouldn't do this.

        address manager = sphinxManager(sphinxConfig);
        // TODO(docs): brackets to prevent stack too deep compiler error
        {

        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        // Check that we're currently pranking/broadcasting from the SphinxManager. This should
        // always be true unless the user deliberately cancels the prank/broadcast in their 'deploy'
        // function.
        if (sphinxMode == SphinxMode.Collect) {
            require(
                callerMode == VmSafe.CallerMode.RecurrentBroadcast && msgSender == manager,
                "Sphinx: TODO(docs)"
            );
        } else {
            require(
                callerMode == VmSafe.CallerMode.RecurrentPrank && msgSender == manager,
                "Sphinx: TODO(docs)"
            );
        }
        }

        require(
            !sphinxUtils.arrayContainsString(referenceNames, _referenceName),
            string(
                abi.encodePacked(
                    "Sphinx: The reference name ",
                    _referenceName,
                    " was used more than once in this deployment. Reference names must be unique. If you are not using reference names already, this error may be due to deploying multiple instances of the same contract. You can resolve this issue by specifying a unique reference name for each contract using the `DeployOptions` input parameter. See the docs for more info: https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md"
                )
            )
        );

        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        address create3Address = sphinxUtils.computeCreate3Address(manager, create3Salt);

        require(create3Address.code.length == 0, "Sphinx: TODO(docs)");

        // TODO(refactor): c/f LocalSphinxManager

        // Deploy the user's contract to the CREATE3 address via the LocalSphinxManager. This
        // mirrors what happens on live networks.
        SphinxCollector(manager).deploy({
                fullyQualifiedName: fullyQualifiedName,
                initCode: vm.getCode(artifactPath),
                constructorArgs: _constructorArgs,
                userSalt: _userSalt,
                referenceName: _referenceName
            });

        referenceNames.push(_referenceName);

        return create3Address;
    }

    // TODO(md): the msg.sender in the constructor of the user's contract is *not* the sphinxmanager.
    // it's actually a minimal create3 proxy that's deployed by the sphinxmanager in the same transaction
    // as the deployment. This is how create3 works.

    /**
     * @notice Deploys a contract to a specified address. This function is copied from
     *         StdCheats.sol. We do this instead of importing StdCheats to limit the number of
     *         functions that are exposed to the user when they inherit this contract.
     *
     *         Note that this function does not set the nonce at the address. If using this function
     *         to deploy a contract at an address where no contract currently exists, consider
     *         calling `vm.setNonce(addr, 1)` before calling this function. This ensures that the
     *         initial nonce is 1, which matches EVM behavior (see EIP-161 part A:
     *         https://github.com/ethereum/EIPs/blob/master/EIPS/eip-161.md#specification)
     *
     * @param initCode  The creation code of the contract to deploy.
     * @param args  The ABI-encoded constructor arguments for the contract.
     * @param where The address to deploy the contract to.
     */
    function _sphinxDeployCodeTo(bytes memory initCode, bytes memory args, address where) private {
        vm.etch(where, abi.encodePacked(initCode, args));
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(success, "Sphinx: Failed to create runtime bytecode.");
        vm.etch(where, runtimeBytecode);
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
     * @notice Get the address of the SphinxManager. Before calling this function, the following
     *         values in the SphinxConfig must be set: `owners`, `threshold`, and `projectName`.
     */
    function sphinxManager(SphinxConfig memory _config) internal view returns (address) {
        return sphinxUtils.getSphinxManagerAddress(_config);
    }

    /**
     * @notice Get an address of a contract to be deployed by Sphinx. This function assumes that a
     *         user-defined salt is not being used to deploy the contract. If it is, use the
     *         overloaded function of the same name. Before calling this function, the following
     *         values in the SphinxConfig must be set: `owners`, `threshold`, and `projectName`.
     */
    function sphinxAddress(
        SphinxConfig memory _config,
        string memory _referenceName
    ) internal view returns (address) {
        return sphinxAddress(_config, _referenceName, bytes32(0));
    }

    /**
     * @notice Get an address of a contract to be deployed by Sphinx. This function assumes that a
     *         user-defined salt is being used to deploy the contract. If it's not, use the
     *         overloaded function of the same name. Before calling this function, the following
     *         values in the SphinxConfig must be set: `owners`, `threshold`, and `projectName`.
     */
    function sphinxAddress(
        SphinxConfig memory _config,
        string memory _referenceName,
        bytes32 _salt
    ) internal view returns (address) {
        address managerAddress = sphinxUtils.getSphinxManagerAddress(_config);
        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _salt));
        return sphinxUtils.computeCreate3Address(managerAddress, create3Salt);
    }
}
