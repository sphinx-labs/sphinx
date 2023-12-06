// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { VmSafe, Vm } from "sphinx-forge-std/Vm.sol";
import { console } from "sphinx-forge-std/console.sol";

import {
    MerkleRootStatus,
    SphinxLeafWithProof
} from "@sphinx-labs/contracts/contracts/core/SphinxDataTypes.sol";
import { ISphinxModule } from "@sphinx-labs/contracts/contracts/core/interfaces/ISphinxModule.sol";
import {
    SphinxMerkleTree,
    HumanReadableAction,
    Network,
    SphinxConfig,
    DeploymentInfo,
    SphinxMode,
    NetworkInfo,
    Wallet,
    Label
} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { SphinxUtils } from "@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol";
import { SphinxConstants } from "@sphinx-labs/contracts/contracts/foundry/SphinxConstants.sol";
import {
    IGnosisSafeProxyFactory
} from "@sphinx-labs/contracts/contracts/foundry/interfaces/IGnosisSafeProxyFactory.sol";

// TODO(gas): use 20% gas-estimate-multiplier and tell ryan.

// TODO(gas-docs): mention somewhere that foundry uses a 30% gas price buffer by default, which can be
// adjusted with a `--gas-estimate-multiplier` flag, which exists on the `forge script` command.

// TODO(gas): consider hardcoding --gas-estimate-multiplier 130. there isn't currently an env var that
// can control this, but if it's added in the future, it could make the gas estimation weird.

// TODO(gas): sanity check that a contract deployment's gas is properly estimated by Foundry (i.e. it
// doesn't give us an empty txn like during the heuristic tests). particularly, foundry won't
// estimate the gas correctly if the relevant contracts don't exist on the node.

// TODO(gas):
// - Update the gas estimation logic for the entire deployment (already did the `gas` fields).
// - We should probably validate that the `gas` for a leaf isn't extremely high (e.g. above the
//   block gas limit). TODO(md): say which versions of Safe we support

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
        sphinxUtils = new SphinxUtils();
        constants = new SphinxConstants();
        // This ensures that these contracts stay deployed in a multi-fork environment (e.g. when
        // calling `vm.createSelectFork`).
        vm.makePersistent(address(constants));
        vm.makePersistent(address(sphinxUtils));
    }

    function sphinxCollectProposal(
        string memory _networkName,
        string memory _deploymentInfoPath
    ) external {
        string memory rpcUrl = vm.rpcUrl(_networkName);
        sphinxUtils.validateProposal(sphinxConfig);

        DeploymentInfo memory deploymentInfo = sphinxCollect(
            sphinxUtils.isLiveNetworkFFI(rpcUrl),
            constants.managedServiceAddress()
        );

        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxCollectDeployment(
        string memory _networkName,
        string memory _deploymentInfoPath
    ) external {
        string memory rpcUrl = vm.rpcUrl(_networkName);

        address deployer;
        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        if (isLiveNetwork) {
            uint256 privateKey = vm.envOr("PRIVATE_KEY", uint256(0));
            require(
                privateKey != 0,
                "Sphinx: You must set the 'PRIVATE_KEY' environment variable to run the deployment."
            );

            deployer = vm.addr(privateKey);

            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, deployer);
        } else {
            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            uint256 privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);
            deployer = vm.addr(privateKey);
        }

        DeploymentInfo memory deploymentInfo = sphinxCollect(isLiveNetwork, deployer);
        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxCollect(
        bool _isLiveNetwork,
        address _executor
    ) private returns (DeploymentInfo memory) {
        address safe = sphinxSafe();
        address module = sphinxModule();

        DeploymentInfo memory deploymentInfo;
        deploymentInfo.safeAddress = safe;
        deploymentInfo.moduleAddress = module;
        deploymentInfo.executorAddress = _executor;
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.safeInitData = sphinxUtils.getSafeInitializerData(
            sphinxConfig.owners,
            sphinxConfig.threshold
        );
        deploymentInfo.newConfig = sphinxConfig;
        deploymentInfo.isLiveNetwork = _isLiveNetwork;
        deploymentInfo.initialState = sphinxUtils.getInitialChainState(safe, ISphinxModule(module));
        deploymentInfo.nonce = sphinxUtils.getMerkleRootNonce(ISphinxModule(module));
        deploymentInfo.arbitraryChain = false;
        deploymentInfo.requireSuccess = true;

        sphinxMode = SphinxMode.Collect;
        vm.startBroadcast(safe);
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
        string memory _merkleTreeFilePath,
        HumanReadableAction[] memory _humanReadableActions
    ) external {
        bytes memory encodedMerkleTree = vm.parseBytes(vm.readFile(_merkleTreeFilePath));
        SphinxMerkleTree memory merkleTree = abi.decode(encodedMerkleTree, (SphinxMerkleTree));

        string memory rpcUrl = vm.rpcUrl(_networkName);

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(rpcUrl);
        uint256 privateKey;
        if (isLiveNetwork) {
            sphinxMode = SphinxMode.LiveNetworkBroadcast;

            (, address msgSender, ) = vm.readCallers();
            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, msgSender);

            privateKey = vm.envUint("PRIVATE_KEY");
        } else {
            sphinxMode = SphinxMode.LocalNetworkBroadcast;

            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            privateKey = sphinxUtils.getSphinxDeployerPrivateKey(0);
            sphinxUtils.initializeFFI(rpcUrl);
        }

        bytes memory metaTxnSignature = sphinxUtils.signMerkleRoot(privateKey, _root);

        vm.startBroadcast(privateKey);
        sphinxDeployOnNetwork(
            ISphinxModule(sphinxModule()),
            _root,
            merkleTree,
            metaTxnSignature,
            rpcUrl,
            _networkName,
            _humanReadableActions
        );
        vm.stopBroadcast();
    }

    /**
     * @notice A helper function used by the Sphinx devs during testing to hook into the
     *         proposal process to do environment setup. Not intended to be used by users.
     */
    function sphinxSetupPropose() internal virtual {}

    function sphinxSimulateProposal(
        bool _testnets,
        bytes32 _root,
        string memory _merkleTreeFilePath,
        HumanReadableAction[][] memory _humanReadableActions
    ) external returns (uint256[] memory) {
        sphinxSetupPropose();

        SphinxMerkleTree memory merkleTree = abi.decode(
            vm.parseBytes(vm.readFile(_merkleTreeFilePath)),
            (SphinxMerkleTree)
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
            forkIds[i] = vm.createSelectFork(rpcUrl);

            // Initialize the Sphinx contracts. We don't call `sphinxUtils.initializeFFI` here
            // because we never broadcast the transactions onto the forked network. This is a
            // performance optimization.
            sphinxUtils.initializeSphinxContracts();

            // We prank the `ManagedService` contract so that the `CallerMode.msgSender`
            // is its address. This replicates a production environment.
            vm.startPrank(constants.managedServiceAddress());
            sphinxDeployOnNetwork(
                ISphinxModule(sphinxModule()),
                _root,
                merkleTree,
                "",
                rpcUrl,
                networkInfo.name,
                _humanReadableActions[i]
            );
            vm.stopPrank();
        }

        return forkIds;
    }

    function sphinxRegisterProject(string memory _rpcUrl, address _msgSender) private {
        if (address(sphinxSafe()).code.length > 0) {
            return;
        }

        address[] memory sortedOwners = sphinxUtils.sortAddresses(sphinxConfig.owners);

        address safeAddress = sphinxModule();
        IGnosisSafeProxyFactory safeProxyFactory = IGnosisSafeProxyFactory(
            constants.safeFactoryAddress()
        );
        address singletonAddress = constants.safeSingletonAddress();

        if (safeAddress.code.length == 0) {
            if (sphinxMode == SphinxMode.LocalNetworkBroadcast) {
                vm.stopBroadcast();
                bytes memory safeInitializerData = sphinxUtils.getSafeInitializerData(
                    sortedOwners,
                    sphinxConfig.threshold
                );
                safeProxyFactory.createProxyWithNonce(
                    singletonAddress,
                    safeInitializerData,
                    sphinxConfig.saltNonce
                );

                sphinxUtils.deployGnosisSafeFFI(sphinxConfig, _rpcUrl);

                vm.startBroadcast(_msgSender);
            } else {
                bytes memory safeInitializerData = sphinxUtils.getSafeInitializerData(
                    sortedOwners,
                    sphinxConfig.threshold
                );
                safeProxyFactory.createProxyWithNonce(
                    singletonAddress,
                    safeInitializerData,
                    sphinxConfig.saltNonce
                );
            }
        }
    }

    /**
     * @notice Helper function for executing a list of actions in batches.
     *
     * @return Two parameters:
     *         - A boolean that'll be `true` if the deployment ends in the `COMPLETED` state, and
     *           `false` if it ends in the `FAILED` state.
     *         - A `HumanReadableAction` struct that allows us to display a helpful error message
     *           to the user if their deployment fails. If their deployment succeeds, we return an
     *           empty `HumanReadableAction` because this parameter will be unused.
     */
    function sphinxExecuteBatchActions(
        ISphinxModule _module,
        bytes32 _merkleRoot,
        SphinxLeafWithProof[] memory _leavesOnNetwork,
        HumanReadableAction[] memory _humanReadableActions
    ) private returns (bool, HumanReadableAction memory) {
        // Define an empty `HumanReadableAction`, which we'll return if the deployment doesn't fail.
        HumanReadableAction memory emptyHumanReadableAction;

        // We can return early if there is only an `APPROVE` leaf and no `EXECUTE` leaves.
        if (_leavesOnNetwork.length == 1) {
            return (true, emptyHumanReadableAction);
        }

        // We execute all actions in batches to reduce the total number of transactions and reduce
        // the cost of a deployment in general. Approaching the maximum block gas limit can cause
        // transactions to be executed slowly as a result of the algorithms that miners use to
        // select which transactions to include. As a result, we restrict our total gas usage to a
        // fraction of the block gas limit. Note that this number should match the one used by the
        // DevOps platform executor.
        uint256 maxGasLimit = block.gaslimit / 2;

        (uint256 numLeaves, uint256 leavesExecuted, , , , ) = _module.merkleRootStates(_merkleRoot);

        while (leavesExecuted < numLeaves) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint256 batchSize = sphinxUtils.findMaxBatchSize(
                sphinxUtils.inefficientSlice(
                    _leavesOnNetwork,
                    leavesExecuted,
                    _leavesOnNetwork.length
                ),
                maxGasLimit
            );
            SphinxLeafWithProof[] memory batch = sphinxUtils.inefficientSlice(
                _leavesOnNetwork,
                leavesExecuted,
                leavesExecuted + batchSize
            );

            ISphinxModule(_module).execute{ gas: maxGasLimit }(batch);
            // TODO - do something with the status
            (, , , , MerkleRootStatus status, ) = ISphinxModule(_module).merkleRootStates(
                _merkleRoot
            );

            if (status == MerkleRootStatus.FAILED) {
                // We return the human readable action that corresponds to the failing transaction.
                return (false, _humanReadableActions[leavesExecuted - 1]);
            }

            leavesExecuted += batchSize;
        }

        // If we make it to this point, we know that the deployment's status is `COMPLETED`.

        return (true, emptyHumanReadableAction);
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
        // prank the Gnosis Safe during the execution process, since this is the contract that
        // deploys their contracts on live networks. If the user enabled pranking before calling
        // `deploy`, then we'll turn it back on at the end of this modifier.
        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();

        sphinxUtils.validate(sphinxConfig);

        if (sphinxMode == SphinxMode.Collect) {
            // Execute the user's 'run()' function.
            _;
        } else if (sphinxMode == SphinxMode.Default) {
            // Prank the Gnosis Safe then execute the user's `run()` function. We prank the Gnosis
            // Safe to replicate the deployment process on live networks.
            vm.startPrank(address(sphinxSafe()));
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
     *         TODO(later): If you examine the function calls in this contract that execute the deployment
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
        ISphinxModule _module,
        bytes32 _root,
        SphinxMerkleTree memory _merkleTree,
        bytes memory _metaTxnSignature,
        string memory _rpcUrl,
        string memory _networkName,
        HumanReadableAction[] memory _humanReadableActions
    ) private {
        // Get the leaves for the current network.
        SphinxLeafWithProof[] memory leavesOnNetwork = sphinxUtils.getLeavesOnNetwork(
            _merkleTree.leavesWithProofs
        );

        if (leavesOnNetwork.length == 0) {
            console.log(
                string(
                    abi.encodePacked(
                        "Sphinx: No Merkle leaves on ",
                        _networkName,
                        ". Exiting early."
                    )
                )
            );
            return;
        }

        (, address msgSender, ) = vm.readCallers();

        sphinxRegisterProject(_rpcUrl, msgSender);

        (, , , , MerkleRootStatus status, ) = _module.merkleRootStates(_root);

        // If we're proposing a Merkle root, its status must be `EMPTY` because the Sphinx Module
        // will throw an error if we attempt to re-approve it. If we're not proposing the Merkle
        // root, its status must be `EMPTY` or `APPROVED`. We allow it to be `APPROVED` when we're
        // not proposing because this allows users to resume an active deployment that they're
        // executing from their local machine.
        bool validMerkleRootStatus = sphinxMode == SphinxMode.Proposal
            ? status == MerkleRootStatus.EMPTY
            : status == MerkleRootStatus.EMPTY || status == MerkleRootStatus.APPROVED;

        require(
            validMerkleRootStatus,
            string(
                abi.encodePacked(
                    "Sphinx: Merkle root already ",
                    sphinxUtils.merkleRootStatusToString(status),
                    " on ",
                    _networkName,
                    "."
                )
            )
        );

        bytes memory ownerSignatures;
        if (sphinxMode == SphinxMode.LiveNetworkBroadcast) {
            ownerSignatures = _metaTxnSignature;
        } else if (
            sphinxMode == SphinxMode.LocalNetworkBroadcast || sphinxMode == SphinxMode.Proposal
        ) {
            Wallet[] memory wallets = sphinxUtils.getSphinxWalletsSortedByAddress(1);

            // Create a list of owner meta transactions. This allows us to run the rest of
            // this function without needing to know the owner private keys. If we don't do
            // this, the rest of this function will fail because there are an insufficient
            // number of owner signatures.
            _sphinxOverrideSafeOwners(sphinxSafe(), wallets[0].addr, _rpcUrl);
            ownerSignatures = sphinxUtils.getOwnerSignatures(wallets, _root);
        }

        if (status == MerkleRootStatus.EMPTY) {
            // The `APPROVE` leaf is always first.
            SphinxLeafWithProof memory approvalLeaf = leavesOnNetwork[0];

            // Execute the `APPROVE` leaf.
            _module.approve{ gas: 1000000 }(_merkleTree.root, approvalLeaf, ownerSignatures);
        }

        // If we make it to this point, we know that the Merkle root is active. We proceed by
        // executing the `EXECUTE` leaves.

        (bool success, HumanReadableAction memory readableAction) = sphinxExecuteBatchActions(
            _module,
            _merkleTree.root,
            leavesOnNetwork,
            _humanReadableActions
        );

        require(
            success,
            string(
                abi.encodePacked(
                    "Sphinx: failed to execute deployment because the following action reverted: ",
                    readableAction.reason
                )
            )
        );
    }

    function run() public virtual;

    /**
     * @notice Uses FFI to set the storage slot of a contract on a local network.
     */
    function _sphinxSetStorageFFI(
        string memory _rpcUrl,
        address _target,
        bytes32 _slotKey,
        bytes32 _value
    ) private {
        string[] memory inputs = new string[](8);
        inputs[0] = "cast";
        inputs[1] = "rpc";
        inputs[2] = "--rpc-url";
        inputs[3] = _rpcUrl;
        // We use the 'hardhat_setStorageAt' RPC method here because it works on Anvil and
        // Hardhat nodes, whereas 'hardhat_setStorageAt' only works on Anvil nodes.
        inputs[4] = "hardhat_setStorageAt";
        inputs[5] = vm.toString(address(_target));
        inputs[6] = vm.toString(_slotKey);
        inputs[7] = vm.toString(_value);
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
    }

    /**
     * @notice Override the Gnosis Safe owners to be a single pre-determined address. This is meant
     *         to be called when running against local networks. It is not used as part  o f  th e
     *         live networkexecution process. Its purpose on local networks is to make projects
     *         executableeven if the private keys of the owners are not known. It's worth mentioning
     *         thatwe define this function in this contract instead of in `SphinxUtils` because
     *         itinvolves an external call, which increases the number of transactions
     *         broadcastedagainst local networks, making it difficult to test that no unnecessary
     *         transactionsare being broadcasted.
     */
    function _sphinxOverrideSafeOwners(
        address _safe,
        address _owner,
        string memory _rpcUrl
    ) private {
        // First update the threshold to one
        bytes32 thresholdSlotKey = bytes32(uint256(4));
        bytes32 bytesThreshold = bytes32(uint256(1));
        vm.store(address(_safe), thresholdSlotKey, bytesThreshold);

        // Then set the sentinal to point to the new owner
        address sentinalAddress = address(0x1);
        bytes32 sentinalSlotKey = keccak256(abi.encode(sentinalAddress, bytes32(uint256(4))));
        bytes32 bytesOwner = bytes32(uint256(uint160(_owner)));
        vm.store(address(_safe), sentinalSlotKey, bytesOwner);

        // Then set the new owner to point to the sentinal
        bytes32 ownerSlotKey = keccak256(abi.encode(_owner, bytes32(uint256(2))));
        bytes32 bytesSentinal = bytes32(uint256(uint160(sentinalAddress)));
        vm.store(address(_safe), ownerSlotKey, bytesSentinal);

        // If broadcasting on a local network, then also update the values on anvil using cast
        if (sphinxMode == SphinxMode.LocalNetworkBroadcast) {
            _sphinxSetStorageFFI(_rpcUrl, _safe, thresholdSlotKey, bytesThreshold);
            _sphinxSetStorageFFI(_rpcUrl, _safe, sentinalSlotKey, bytesOwner);
            _sphinxSetStorageFFI(_rpcUrl, _safe, ownerSlotKey, bytesSentinal);
        }
    }

    /**
     * @notice Get the address of the SphinxModule. Before calling this function, the
     *         `sphinxConfig.owners` array and `sphinxConfig.threshold` must be set.
     */
    function sphinxModule() public view returns (address) {
        return sphinxUtils.getSphinxModuleAddress(sphinxConfig);
    }

    /**
     * @notice Get the address of the SphinxModule. Before calling this function, the
     *         `sphinxConfig.owners` array and `sphinxConfig.threshold` must be set.
     */
    function sphinxSafe() public view returns (address) {
        return sphinxUtils.getSphinxSafeAddress(sphinxConfig);
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

// TODO(later): If we're keeping the hard-coded { gas } values, consider bringing back the
// bufferedGasLimit. we'd pass in a flat 30% of the block gas limit to the `execute` function b/c
// 50% of the block gas limit is a lot of ETH. if we do 30% here, we should also do 30% in the
// executor logic to make the gas estimation more accurate.
