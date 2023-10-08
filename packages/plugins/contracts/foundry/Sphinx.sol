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
    ProposalOutput,
    SphinxConfig,
    BundleInfo,
    InitialChainState,
    DeploymentInfo,
    BundledAuthLeaf,
    SphinxMode,
    NetworkInfo,
    OptionalAddress
} from "./SphinxPluginTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { ISemver } from "@sphinx-labs/contracts/contracts/interfaces/ISemver.sol";

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
 *         `SphinxUtils.initialize`). Since it doesn't detect that these contracts exist, it will
 *         use a very low gas amount for the deployment transactions, since it expects them to fail.
 *         This causes the deployment to fail.
 */
abstract contract Sphinx {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    DeploymentInfo private deploymentInfo;

    SphinxConstants private immutable constants;

    /**
     * @notice The configuration options for the user's project. This variable must have `internal`
     *         visibility so that the user can set fields on it in their constructor.
     */
    SphinxConfig internal sphinxConfig;

    /**
     * @notice A utility contract that provides helper functions. This variable must have `internal`
     *         visibility so that the user can call functions on it, such as retrieving a `CREATE3`
     *         address of a contract.
     */
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
        // TODO(ryan): is it okay that we set this here? i think you may have said that the default
        // version is different on OP, although i'm not sure.
        sphinxConfig.version = Version({ major: 0, minor: 2, patch: 5 });

        sphinxUtils = new SphinxUtils();
        constants = new SphinxConstants();
        // This ensures that these contracts stay deployed in a multi-fork environment (e.g. when
        // calling `vm.createSelectFork`).
        vm.makePersistent(address(constants));
        vm.makePersistent(address(sphinxUtils));
    }

    // TODO(optional): Make a note that you decided not to do this: I decided not to implement the logic
    // in the SphinxAuth contract that throws an error if there's an active auth bundle. I realized
    // that if the user needs to call the `setup` function more than once, this logic would prevent
    // them from doing it. I'd need to spend more time thinking about a proper solution, but it
    // doesn't strike me as important enough to prioritize for this release.

    /**
     * @notice Called within the `sphinx deploy` CLI command. It is not meant to be called directly
     *         by the user, which is why it's marked as `external`. This function serves two
     *         purposes:
     *         1. When it's called without the `--broadcast` flag, it simulates a deployment and
     *            writes the `DeploymentInfo` struct to the filesystem, which the `sphinx deploy`
     *            command uses to display a preview of the deployment to the user.
     *         2. When it's called with the `--broadcast` flag, it deploys the user's contracts to
     *            the specified network. It also writes the `DeploymentInfo` struct to the
     *            filesystem, which is used to write deployment artifacts to the filesystem.
     */
    function sphinxDeployTask(
        string memory _networkName,
        string memory _deploymentInfoPath
    ) external {
        Network network = sphinxUtils.findNetworkInfoByName(_networkName).network;
        string memory rpcUrl = vm.rpcUrl(_networkName);

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        uint256 privateKey;
        if (isLiveNetwork) {
            privateKey = vm.envOr("PRIVATE_KEY", uint256(0));
            require(
                privateKey != 0,
                "Sphinx: You must set the 'PRIVATE_KEY' environment variable to run the deployment."
            );
        } else {
            // TODO(docs):
            privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);
        }

        vm.startBroadcast(privateKey);
        deploy(network);
        vm.stopBroadcast();
        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    // TODO(docs)
    function setupPropose() internal virtual {}

    function sphinxProposeTask(bool _testnets, string memory _proposalOutputPath) external returns (bytes32, uint256[] memory) {
        setupPropose();

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

            // Create a fork of the target network. This automatically sets the `block.chainid` to
            // the target chain (e.g. 1 for ethereum mainnet).
            uint256 forkId = vm.createSelectFork(rpcUrl);
            forkIds[i] = forkId;

            // TODO(docs): we don't call `sphinxUtils.initializeFFI` here because we never broadcast
            // the transactions onto the forked network.
            sphinxUtils.initializeSphinxContracts(OptionalAddress({exists: true, value: proposer}));

            // We prank the proposer here so that the `msgSender` is the proposer's address, which
            // we use in `validateProposal`.
            vm.startPrank(proposer);
            deploy(network);
            vm.stopPrank();

            deploymentInfoArray[i] = deploymentInfo;
        }

        (bytes32 authRoot, BundleInfo[] memory bundleInfoArray) = sphinxUtils.getBundleInfoFFI(
            deploymentInfoArray
        );

        bytes memory metaTxnSignature = sphinxUtils.signMetaTxnForAuthRoot(
            vm.envUint("PROPOSER_PRIVATE_KEY"),
            authRoot
        );

        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];
            string memory rpcUrl = vm.rpcUrl(sphinxUtils.getNetworkInfo(network).name);
            uint256 forkId = forkIds[i];
            BundleInfo memory bundleInfo = bundleInfoArray[i];

            vm.selectFork(forkId);

            vm.startPrank(proposer);
            sphinxDeployOnNetwork(authRoot, bundleInfo, metaTxnSignature, rpcUrl);
            vm.stopPrank();
        }

        vm.writeFile(_proposalOutputPath, vm.toString(abi.encode(ProposalOutput({authRoot: authRoot, bundleInfoArray:  bundleInfoArray, metaTxnSignature: metaTxnSignature, proposerAddress: proposer}))));

        return (authRoot, forkIds);
    }

    // TODO(test): check for the expected number of broadcasted transactions in `sphinx deploy`.
    // e.g. it seemes there's an `authFactory.auths()` call being made that costs eth.

    function sphinxRegisterProject(string memory _rpcUrl, address _msgSender) private {
        address[] memory sortedOwners = sphinxUtils.sortAddresses(sphinxConfig.owners);

        bytes memory authData = abi.encode(sortedOwners, sphinxConfig.threshold);

        ISphinxAuthFactory authFactory = ISphinxAuthFactory(constants.authFactoryAddress());
        bytes32 authSalt = keccak256(abi.encode(authData, sphinxConfig.projectName));
        bool isRegistered = address(authFactory.auths(authSalt)) != address(0);
        if (!isRegistered) {
            // TODO(docs)
            if (sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                vm.stopBroadcast();
                authFactory.deploy{ gas: 2000000 }(authData, hex"", sphinxConfig.projectName);
                vm.startBroadcast(_msgSender);

                // TODO(mv)
                string[] memory inputs;
                inputs = new string[](8);
                inputs[0] = "cast";
                inputs[1] = "send";
                inputs[2] = vm.toString(address(authFactory));
                inputs[3] = vm.toString(abi.encodePacked(authFactory.deploy.selector, abi.encode(authData, hex"", sphinxConfig.projectName)));
                inputs[4] = "--rpc-url";
                inputs[5] = _rpcUrl;
                inputs[6] = "--private-key";
                // TODO(docs): we use the second sphinx account (index 1) here because the first
                // sphinx account is broadcasting the transactions, which means executing a
                // transaction here would increment its nonce, causing the broadcast to fail.
                inputs[7] = vm.toString(bytes32(sphinxUtils.getSphinxDeployerPrivateKey(1)));
                Vm.FfiResult memory result = vm.tryFfi(inputs);
                if (result.exit_code == 1) revert(string(result.stderr));
            } else {
                authFactory.deploy{ gas: 2000000 }(authData, hex"", sphinxConfig.projectName);
            }
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
                // We use a low-level call here to capture the returned error message, which
                // we use to retrieve the index of the failed action. This allows us to display
                // a nice error message to the user.
                (bool success, bytes memory result) = address(manager).call{
                    gas: bufferedGasLimit
                }(abi.encodeCall(ISphinxManager.executeInitialActions, (rawActions, _proofs)));
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
        // Define an empty action, which we'll return if the deployment succeeds.
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

        // We allow users to call `vm.startPrank` before calling their `deploy` function so that
        // they don't need to toggle it before and after calling `deploy`, which may be annoying for
        // users who have complex deployment flows. However, we turn pranking off here because we'll
        // prank the SphinxManager during the execution process, since this is the contract that
        // deploys their contracts on live networks. If the user enabled pranking before calling
        // `deploy`, then we'll turn it back on at the end of this modifier.
        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();

        delete deploymentInfo;

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

        sphinxUtils.validate(sphinxConfig, _network);

        if (sphinxMode == SphinxMode.Proposal) {
            InitialChainState memory initialState = sphinxUtils.getInitialChainState(auth, manager);
            sphinxUtils.validateProposal(auth, msgSender, _network, sphinxConfig);

            vm.startPrank(address(manager));
            _;
            vm.stopPrank();

            string memory rpcUrl = vm.rpcUrl(sphinxUtils.getNetworkInfo(_network).name);
            sphinxUpdateDeploymentInfo(sphinxUtils.isLiveNetworkFFI(rpcUrl), initialState, sphinxConfig, sphinxMode);

            sphinxUtils.tearDownClients(deploymentInfo.actionInputs, manager);
        } else if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            vm.stopBroadcast();

            // Make the owner a proposer. If we don't do this, the execution logic will fail
            // because a proposer's meta transaction signature is required for the
            // `SphinxAuth.propose` function.
            sphinxConfig.proposers.push(sphinxConfig.owners[0]);

            string memory rpcUrl = vm.rpcUrl(sphinxUtils.getNetworkInfo(_network).name);

            bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
            if (isLiveNetwork) {
                sphinxMode = SphinxMode.LiveNetworkBroadcast;
                sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, auth, msgSender);
                // TODO: where do we check that the sphinx contracts are deployed in this mode?
            } else {
                sphinxMode = SphinxMode.LocalNetworkBroadcast;
                sphinxUtils.initializeFFI(rpcUrl, OptionalAddress({exists: true, value: msgSender}));
            }

            InitialChainState memory initialState = sphinxUtils.getInitialChainState(auth, manager);

            vm.startPrank(address(manager));
            _;
            vm.stopPrank();

            sphinxUpdateDeploymentInfo(isLiveNetwork, initialState, sphinxConfig, sphinxMode);

            DeploymentInfo[] memory deploymentInfoArray = new DeploymentInfo[](1);
            deploymentInfoArray[0] = deploymentInfo;
            (bytes32 authRoot, BundleInfo[] memory bundleInfoArray) = sphinxUtils.getBundleInfoFFI(
                deploymentInfoArray
            );
            // There's a single bundle info in the array because we only deploy to one network.
            require(
                bundleInfoArray.length == 1,
                "Sphinx: Found more than one BundleInfo in array. Should never happen."
            );
            BundleInfo memory bundleInfo = bundleInfoArray[0];

            uint256 deployerPrivateKey = isLiveNetwork ? vm.envUint("PRIVATE_KEY") : sphinxUtils.getSphinxDeployerPrivateKey(0);
            bytes memory metaTxnSignature = sphinxUtils.signMetaTxnForAuthRoot(
                deployerPrivateKey,
                authRoot
            );

            sphinxUtils.tearDownClients(deploymentInfo.actionInputs, manager);

            vm.startBroadcast(msgSender);
            sphinxDeployOnNetwork(authRoot, bundleInfo, metaTxnSignature, rpcUrl);
        } else if (sphinxMode == SphinxMode.Default) {
            // Deploy the SphinxManager. We only do this in the Default mode because the
            // SphinxManager will be deployed in the `SphinxAuthFactory.register` call in other
            // modes.
            sphinxUtils.deploySphinxManagerTo(address(manager));

            vm.startPrank(address(manager));
            _;
            vm.stopPrank();

            sphinxUtils.tearDownClients(deploymentInfo.actionInputs, manager);

            // We update the SphinxManager after the deployment because this mimics what happens on
            // a live network. In particular, we update the `callNonces` mapping in the
            // SphinxManager, which determines which function calls will be skipped on subsequent
            // deployments. Doing this ensures that the deployment is idempotent, which means that
            // the actions won't be re-executed if the user calls the `deploy` function again.
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

    function sphinxDeployOnNetwork(bytes32 _authRoot, BundleInfo memory _bundleInfo, bytes memory _metaTxnSignature, string memory _rpcUrl) private {
        (, address msgSender, ) = vm.readCallers();

        if (_bundleInfo.authLeafs.length == 0) {
            console.log(
                string(
                    abi.encodePacked(
                        "Sphinx: Nothing to execute on",
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
        DeploymentState memory deploymentState = manager.deployments(deploymentId);

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

        // TODO: document this entire process. some stuff here is outdated

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            bytes[] memory ownerSignatureArray;
            if (sphinxMode == SphinxMode.LiveNetworkBroadcast) {
                ownerSignatureArray = new bytes[](1);
                ownerSignatureArray[0] = _metaTxnSignature;
            } else if (sphinxMode == SphinxMode.LocalNetworkBroadcast || sphinxMode == SphinxMode.Proposal) {
                uint256 currentOwnerThreshold = auth.threshold();
                ownerSignatureArray = new bytes[](currentOwnerThreshold);

                Vm.Wallet[] memory wallets = sphinxUtils.getSphinxWalletsSortedByAddress(currentOwnerThreshold);
                for (uint256 i = 0; i < currentOwnerThreshold; i++) {
                    // TODO(docs): another potential strategy is to set the owner threshold to 0,
                    // but we do it this way because it allows us to run the meta transaction
                    // signature verification logic in the SphinxAuth contract instead of skipping
                    // it entirely, which would be the case if we set the owner threshold to 0.
                    sphinxUtils.grantRoleInAuthContract(auth, bytes32(0), wallets[i].addr, _rpcUrl, sphinxMode);
                    ownerSignatureArray[i] = sphinxUtils.signMetaTxnForAuthRoot(
                        wallets[i].privateKey,
                        _authRoot
                    );
                }
            }

            (, uint256 leafsExecuted, ) = auth.authStates(_authRoot);
            for (uint i = 0; i < _bundleInfo.authLeafs.length; i++) {
                BundledAuthLeaf memory leaf = _bundleInfo.authLeafs[i];

                if (leafsExecuted > leaf.leaf.index) {
                    continue;
                }

                if (leaf.leafTypeEnum == AuthLeafType.SETUP) {
                    auth.setup{ gas: 3000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafTypeEnum == AuthLeafType.PROPOSE) {
                    if (sphinxMode == SphinxMode.LiveNetworkBroadcast) {
                        auth.propose{ gas: 1000000 }(
                            _authRoot,
                            leaf.leaf,
                            ownerSignatureArray,
                            leaf.proof
                        );
                    } else if (sphinxMode == SphinxMode.Proposal || sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                        sphinxUtils.grantRoleInAuthContract(auth, keccak256("ProposerRole"), msgSender, _rpcUrl, sphinxMode);

                        bytes[] memory proposerSignatureArray = new bytes[](1);
                        proposerSignatureArray[0] = _metaTxnSignature;

                        auth.propose{ gas: 1000000 }(
                            _authRoot,
                            leaf.leaf,
                            proposerSignatureArray,
                            leaf.proof
                        );
                    }
                } else if (leaf.leafTypeEnum == AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL) {
                    auth.upgradeManagerAndAuthImpl{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafTypeEnum == AuthLeafType.APPROVE_DEPLOYMENT) {
                    auth.approveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        ownerSignatureArray,
                        leaf.proof
                    );
                    deploymentState.status = DeploymentStatus.APPROVED;
                } else if (leaf.leafTypeEnum == AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT) {
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
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED ||
            deploymentState.status == DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
        ) {
            // TODO(docs)
            if (sphinxMode == SphinxMode.Proposal || sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                manager.claimDeployment{ gas: 1000000 }();
            }

            (
                bool executionSuccess,
                HumanReadableAction memory readableAction
            ) = sphinxExecuteDeployment(_bundleInfo, block.gaslimit);

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
     *                           See `deployCodeToAddress` for more detail on why the artifact is used instead of the FQN.
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
            _sphinxDeployCodeTo(artifactPath, _constructorArgs, create3Address);
        }

        // Set the user's contract's code to the implementation address.
        vm.etch(impl, create3Address.code);

        // Deploy the client to the CREATE3 address.
        _sphinxDeployCodeTo(
            clientArtifactPath,
            abi.encode(manager, address(this), impl),
            create3Address
        );

        return create3Address;
    }

    /**
     * @notice Deploys a contract to a specified address. This function is copied from
     *         StdCheats.sol. We do this instead of importing StdCheats to limit the number of
     *         functions that are exposed to the user when they inherit this contract. Note that we
     *         define this function in this contract instead of in `SphinxUtils` so that we can
     *         control the `msg.sender` in the deployed contract's constructor. In particular, this
     *         allows us to prank the `SphinxManager` to ensure that it's the `msg.sender` when
     *         deploying the user's contracts in their `deploy` function. This mirrors what happens
     *         on a live network.
     *
     * @param what  The contract to deploy. Valid formats for this field are explained here:
     *              https://book.getfoundry.sh/cheatcodes/get-code?highlight=getCode#getcode
     * @param args  The ABI-encoded constructor arguments for the contract.
     * @param where The address to deploy the contract to.
     */
    function _sphinxDeployCodeTo(string memory what, bytes memory args, address where) private {
        bytes memory creationCode = vm.getCode(what);
        vm.etch(where, abi.encodePacked(creationCode, args));
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(success, "Sphinx: Failed to create runtime bytecode.");
        vm.etch(where, runtimeBytecode);
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
        _sphinxDeployCodeTo(_clientPath, abi.encode(manager, address(this), impl), _targetAddress);
        return _targetAddress;
    }

    function sphinxAddActionInput(SphinxActionInput memory _input) external {
        deploymentInfo.actionInputs.push(_input);
    }

    function sphinxUpdateDeploymentInfo(
        bool _isLiveNetwork,
        InitialChainState memory _initialState,
        SphinxConfig memory _newConfig,
        SphinxMode _mode
    ) private {
        deploymentInfo.authAddress = address(auth);
        deploymentInfo.managerAddress = address(manager);
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.newConfig = _newConfig;
        deploymentInfo.isLiveNetwork = _isLiveNetwork;
        deploymentInfo.initialState = _initialState;
        // TODO(docs)
        deploymentInfo.remoteExecution = _mode == SphinxMode.Proposal || _mode == SphinxMode.LocalNetworkBroadcast;
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
                address create3Address = sphinxUtils.computeCreate3Address(
                    address(manager),
                    sphinxCreate3Salt
                );
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
