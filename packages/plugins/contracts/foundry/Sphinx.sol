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
    Label,
    SphinxTransaction
} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { SphinxUtils } from "@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol";
import { SphinxConstants } from "@sphinx-labs/contracts/contracts/foundry/SphinxConstants.sol";
import { IGnosisSafe } from "@sphinx-labs/contracts/contracts/foundry/interfaces/IGnosisSafe.sol";
import {
    IGnosisSafeProxyFactory
} from "@sphinx-labs/contracts/contracts/foundry/interfaces/IGnosisSafeProxyFactory.sol";

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
 *
 * @dev    We refer to this contract in Sphinx's documentation. Make sure to update the
 *         documentation if you change the name or location of this contract.
 */
abstract contract Sphinx {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // These are constants thare are used when signing an EIP-712 meta transaction.
    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256(bytes("Sphinx")),
                keccak256(bytes("1.0.0"))
            )
        );
    bytes32 private constant TYPE_HASH = keccak256("MerkleRoot(bytes32 root)");

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
            deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
            sphinxUtils.validateLiveNetworkBroadcast(
                sphinxConfig,
                deployer,
                IGnosisSafe(sphinxSafe())
            );
        } else {
            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            uint256 privateKey = sphinxUtils.getSphinxWalletPrivateKey(0);
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
        deploymentInfo.blockGasLimit = block.gaslimit;
        deploymentInfo.safeInitData = sphinxUtils.getGnosisSafeInitializerData(
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

    function sphinxDeployModuleAndGnosisSafe(string memory _networkName) external {
        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(vm.rpcUrl(_networkName));

        address safe = sphinxSafe();
        require(safe.code.length == 0, "Sphinx: Gnosis Safe already deployed");

        uint256 privateKey;
        if (isLiveNetwork) {
            privateKey = vm.envUint("PRIVATE_KEY");
            sphinxUtils.validateLiveNetworkBroadcast(
                sphinxConfig,
                vm.addr(privateKey),
                IGnosisSafe(safe)
            );
        } else {
            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            privateKey = sphinxUtils.getSphinxWalletPrivateKey(0);
        }

        vm.startBroadcast(privateKey);
        _sphinxDeployModuleAndGnosisSafe();
        vm.stopBroadcast();
    }

    function sphinxApprove(
        bytes32 _merkleRoot,
        SphinxLeafWithProof memory _approveLeafWithProof,
        bool _simulatingProposal
    ) public {
        NetworkInfo memory networkInfo = sphinxUtils.findNetworkInfoByChainId(
            _approveLeafWithProof.leaf.chainId
        );

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(vm.rpcUrl(networkInfo.name));

        IGnosisSafe safe = IGnosisSafe(sphinxSafe());
        ISphinxModule module = ISphinxModule(sphinxModule());

        require(address(safe).code.length > 0, "Sphinx: Gnosis Safe is not deployed");

        (, , , , MerkleRootStatus status, ) = module.merkleRootStates(_merkleRoot);

        require(
            status == MerkleRootStatus.EMPTY,
            string(
                abi.encodePacked(
                    "Sphinx: Merkle root already ",
                    sphinxUtils.merkleRootStatusToString(status),
                    "."
                )
            )
        );

        uint256 privateKey;
        if (isLiveNetwork && !_simulatingProposal) {
            sphinxMode = SphinxMode.LiveNetworkBroadcast;

            (, address msgSender, ) = vm.readCallers();
            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, msgSender, safe);

            privateKey = vm.envUint("PRIVATE_KEY");
        } else {
            sphinxMode = SphinxMode.LocalNetworkBroadcast;

            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            privateKey = sphinxUtils.getSphinxWalletPrivateKey(0);
        }

        bytes memory ownerSignatures;
        if (isLiveNetwork && !_simulatingProposal) {
            Wallet[] memory walletArray = new Wallet[](1);
            walletArray[0] = Wallet({ privateKey: privateKey, addr: vm.addr(privateKey) });

            ownerSignatures = _sphinxSignMerkleRoot(walletArray, _merkleRoot);
        } else {
            uint256 ownerThreshold = safe.getThreshold();
            Wallet[] memory sphinxWallets = sphinxUtils.getSphinxWalletsSortedByAddress(
                ownerThreshold
            );

            ownerSignatures = _sphinxSignMerkleRoot(sphinxWallets, _merkleRoot);
        }

        // Broadcast if there isn't already an active broadcast.
        (VmSafe.CallerMode callerMode, , ) = vm.readCallers();
        if (callerMode == VmSafe.CallerMode.None) vm.broadcast(privateKey);

        // Execute the `APPROVE` leaf.
        module.approve(_merkleRoot, _approveLeafWithProof, ownerSignatures);
    }

    /**
     * @notice Broadcasts a deployment. Meant to be called in the `sphinx deploy` CLI command.
     */
    function sphinxExecute(
        string memory _networkName,
        string memory _deployTaskInputsFilePath
    ) external {
        (
            SphinxMerkleTree memory merkleTree,
            HumanReadableAction[] memory humanReadableActions
        ) = abi.decode(
                vm.parseBytes(vm.readFile(_deployTaskInputsFilePath)),
                (SphinxMerkleTree, HumanReadableAction[])
            );

        bool isLiveNetwork = sphinxUtils.isLiveNetworkFFI(vm.rpcUrl(_networkName));

        IGnosisSafe safe = IGnosisSafe(sphinxSafe());

        require(address(safe).code.length > 0, "Sphinx: Gnosis Safe is not deployed");

        uint256 privateKey;
        if (isLiveNetwork) {
            sphinxMode = SphinxMode.LiveNetworkBroadcast;

            (, address msgSender, ) = vm.readCallers();
            sphinxUtils.validateLiveNetworkBroadcast(sphinxConfig, msgSender, safe);

            privateKey = vm.envUint("PRIVATE_KEY");
        } else {
            sphinxMode = SphinxMode.LocalNetworkBroadcast;

            // We use an auto-generated private key when deploying to a local network so that anyone
            // can deploy a project even if they aren't the sole owner. This is useful for
            // broadcasting deployments onto Anvil when the project is owned by multiple accounts.
            privateKey = sphinxUtils.getSphinxWalletPrivateKey(0);
        }

        vm.startBroadcast(privateKey);

        _sphinxExecuteOnNetwork(
            ISphinxModule(sphinxModule()),
            merkleTree.root,
            merkleTree.leavesWithProofs,
            humanReadableActions
        );

        vm.stopBroadcast();
    }

    /**
     * @notice A helper function used by the Sphinx devs during testing to hook into the
     *         proposal process to do environment setup. Not intended to be used by users.
     */
    function sphinxSetupPropose() internal virtual {}

    function sphinxSimulateProposal(
        string[] memory _networkNames,
        string memory _simulationInputsFilePath
    ) external {
        sphinxSetupPropose();

        (
            SphinxMerkleTree memory merkleTree,
            HumanReadableAction[][] memory humanReadableActionsArray
        ) = abi.decode(
                vm.parseBytes(vm.readFile(_simulationInputsFilePath)),
                (SphinxMerkleTree, HumanReadableAction[][])
            );

        sphinxMode = SphinxMode.Proposal;

        ISphinxModule module = ISphinxModule(sphinxModule());
        IGnosisSafe safe = IGnosisSafe(sphinxSafe());
        address managedServiceAddress = constants.managedServiceAddress();

        for (uint256 i = 0; i < _networkNames.length; i++) {
            // Create a fork of the target network. This automatically sets the `block.chainid` to
            // the target chain.
            vm.createSelectFork(vm.rpcUrl(_networkNames[i]));

            // Get the leaves for the current network.
            SphinxLeafWithProof[] memory leavesOnNetwork = sphinxUtils.getLeavesOnNetwork(
                merkleTree.leavesWithProofs
            );

            if (leavesOnNetwork.length == 0) {
                continue;
            }

            if (address(safe).code.length == 0) {
                // Deploy the Gnosis Safe and Sphinx Module. We can't broadcast this transaction
                // from the Gnosis Safe or the Sphinx Module because Foundry throws an error if we
                // attempt to broadcast from the same contract address that we're deploying. We
                // broadcast from the Managed Service contract so that this transaction is included
                // in the off-chain gas estimation logic.
                vm.startBroadcast(managedServiceAddress);
                _sphinxDeployModuleAndGnosisSafe();
                vm.stopBroadcast();
            }

            // Next, we add a set of auto-generated addresses as owners of the Gnosis Safe. This is
            // necessary to simulate the deployment because the actual Gnosis Safe owner private
            // keys aren't known. We broadcast from the Gnosis Safe because this is necessary to
            // prevent the calls from reverting. Our off-chain gas estimation logic will skip these
            // transactions because it only estimates gas for transactions where the Managed Service
            // is the sender.
            vm.startBroadcast(address(safe));
            uint256 ownerThreshold = safe.getThreshold();
            Wallet[] memory sphinxWallets = sphinxUtils.getSphinxWalletsSortedByAddress(
                ownerThreshold
            );
            // Add the auto-generated wallets as owners of the Gnosis Safe. We add `threshold`
            // owners so that the signature validation logic in the Gnosis Safe will iterate
            // over the same number of owners locally as in production. This is important for
            // gas estimation.
            for (uint256 j = 0; j < ownerThreshold; j++) {
                // Check that the auto-generated wallet isn't already an owner. If we attempt
                // to add an owner twice, Gnosis Safe will throw an error.
                if (!safe.isOwner(sphinxWallets[j].addr)) {
                    // The Gnosis Safe doesn't have an "addOwner" function, which is why we need to
                    // use "addOwnerWithThreshold".
                    safe.addOwnerWithThreshold(sphinxWallets[j].addr, ownerThreshold);
                }
            }
            vm.stopBroadcast();

            // We broadcast from the ManagedService contract to replicate the production
            // environment, where the `ManagedService` will call the Sphinx Module.
            vm.startBroadcast(managedServiceAddress);
            sphinxApprove(
                merkleTree.root,
                // The `APPROVE` leaf is always the first element in the array.
                leavesOnNetwork[0],
                true
            );
            vm.stopBroadcast();

            // Remove the auto-generated wallets as owners of the Gnosis Safe. The logic for this is
            // a little bizarre because Gnosis Safe uses a linked list to store the owner addresses.
            vm.startBroadcast(address(safe));
            for (uint256 j = 0; j < ownerThreshold - 1; j++) {
                safe.removeOwner(sphinxWallets[j + 1].addr, sphinxWallets[j].addr, ownerThreshold);
            }
            safe.removeOwner(
                address(1), // Gnosis Safe's `SENTINEL_OWNERS`.
                sphinxWallets[ownerThreshold - 1].addr,
                ownerThreshold
            );
            vm.stopBroadcast();

            // We broadcast from the ManagedService contract to replicate the production
            // environment, where the `ManagedService` will call the Sphinx Module.
            vm.startBroadcast(managedServiceAddress);
            _sphinxExecuteOnNetwork(
                module,
                merkleTree.root,
                leavesOnNetwork,
                humanReadableActionsArray[i]
            );
            vm.stopBroadcast();
        }
    }

    /**
     * @notice Executes a single transaction that deploys a Gnosis Safe, deploys a Sphinx Module,
     *         and enables the Sphinx Module in the Gnosis Safe
     *
     * @dev    We refer to this function in Sphinx's documentation. Make sure to update the
     *         documentation if you change the name of this function or change its file
     *         location.
     */
    function _sphinxDeployModuleAndGnosisSafe() private {
        IGnosisSafeProxyFactory safeProxyFactory = IGnosisSafeProxyFactory(
            constants.safeFactoryAddress()
        );
        address singletonAddress = constants.safeSingletonAddress();

        bytes memory safeInitializerData = sphinxUtils.getGnosisSafeInitializerData(
            sphinxConfig.owners,
            sphinxConfig.threshold
        );

        // This is the transaction that deploys the Gnosis Safe, deploys the Sphinx Module,
        // and enables the Sphinx Module in the Gnosis Safe.
        safeProxyFactory.createProxyWithNonce(
            singletonAddress,
            safeInitializerData,
            sphinxConfig.saltNonce
        );
    }

    /**
     * @notice Helper function for executing `EXECUTE` Merkle leaves in batches.
     */
    function _sphinxExecuteOnNetwork(
        ISphinxModule _module,
        bytes32 _merkleRoot,
        SphinxLeafWithProof[] memory _leavesWithProofsOnNetwork,
        HumanReadableAction[] memory _humanReadableActions
    ) private {
        if (_leavesWithProofsOnNetwork.length <= 1) {
            console.log(
                string(
                    abi.encodePacked(
                        "Sphinx: Nothing to execute on ",
                        sphinxUtils.findNetworkInfoByChainId(block.chainid).name,
                        ". Exiting early."
                    )
                )
            );
            return;
        }

        // We execute all actions in batches to reduce the total number of transactions and reduce
        // the cost of a deployment in general. Approaching the maximum block gas limit can cause
        // transactions to be executed slowly as a result of the algorithms that miners use to
        // select which transactions to include. As a result, we restrict our total gas usage to a
        // fraction of the block gas limit. Note that this number should match the one used by the
        // DevOps platform executor.
        uint256 maxGasLimit = block.gaslimit / 2;

        MerkleRootStatus status;
        uint256 numLeaves;
        uint256 leavesExecuted;
        (numLeaves, leavesExecuted, , , status, ) = _module.merkleRootStates(_merkleRoot);

        require(
            status == MerkleRootStatus.APPROVED,
            string(
                abi.encodePacked(
                    "Sphinx: Merkle root must be be active, but its status is: ",
                    sphinxUtils.merkleRootStatusToString(status),
                    "."
                )
            )
        );

        while (leavesExecuted < numLeaves) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint256 batchSize = sphinxUtils.findMaxBatchSize(
                sphinxUtils.inefficientSlice(
                    _leavesWithProofsOnNetwork,
                    leavesExecuted,
                    _leavesWithProofsOnNetwork.length
                ),
                maxGasLimit
            );
            SphinxLeafWithProof[] memory batch = sphinxUtils.inefficientSlice(
                _leavesWithProofsOnNetwork,
                leavesExecuted,
                leavesExecuted + batchSize
            );

            ISphinxModule(_module).execute(batch);
            (, , , , status, ) = ISphinxModule(_module).merkleRootStates(_merkleRoot);

            require(
                status != MerkleRootStatus.FAILED,
                string(
                    abi.encodePacked(
                        "Sphinx: failed to execute deployment because the following action reverted: ",
                        _humanReadableActions[leavesExecuted - 1].reason
                    )
                )
            );

            leavesExecuted += batchSize;
        }
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

    function run() public virtual;

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

    /**
     * @notice Estimates the values of the `gas` fields in the Merkle leaves using `gasleft`. This
     *         provides a more accurate estimate than simulating the transactions and retrieving
     *         them from Foundry's broadcast file. Particularly, it's possible to underestimate the
     *         Merkle leaf's gas with the simulation approach. Consider this (contrived) edge case:
     *         Say a user's transaction deploys a contract, which costs ~2 million gas, and also
     *         involves a large gas refund (~500k gas). Since gas refunds occur after the
     *         transaction is executed, the broadcast file will have a gas estimate of ~1.5 million
     *         gas. However, the user's transaction costs 2 million gas. This will cause Sphinx to
     *         underestimate the Merkle leaf's gas, resulting in a failed deployment on-chain. This
     *         situation uses contrived numbers, but the point is that using `gasleft` is accurate
     *         even if there's a large gas refund.
     *
     * @return abiEncodedGasArray The ABI encoded array of gas estimates. There's one element per
     *                            `EXECUTE` Merkle leaf. We ABI encode the array because Foundry
     *                            makes it difficult to reliably parse complex data types off-chain.
     *                            Specifically, an array element looks like this in the returned
     *                            JSON: `27222 [2.722e4]`.
     */
    function sphinxEstimateMerkleLeafGas(
        string memory _leafGasParamsFilePath,
        uint256 _chainId
    ) external returns (bytes memory abiEncodedGasArray) {
        SphinxTransaction[] memory txnArray = abi.decode(
            vm.parseBytes(vm.readFile(_leafGasParamsFilePath)),
            (SphinxTransaction[])
        );

        IGnosisSafe safe = IGnosisSafe(sphinxSafe());
        address module = sphinxModule();
        address managedServiceAddress = constants.managedServiceAddress();

        uint256[] memory gasEstimates = new uint256[](txnArray.length);

        // Create a fork of the target network.
        NetworkInfo memory networkInfo = sphinxUtils.findNetworkInfoByChainId(_chainId);
        vm.createSelectFork(vm.rpcUrl(networkInfo.name));

        // Deploy the Sphinx Module and Gnosis Safe if they're not already deployed.
        if (address(safe).code.length == 0) {
            // Deploy the Gnosis Safe and Sphinx Module. It's not strictly necessary to prank the
            // Managed Service contract, but this replicates the prod environment, so we do it
            // anyways.
            vm.startPrank(managedServiceAddress);
            _sphinxDeployModuleAndGnosisSafe();
            vm.stopPrank();
        }

        // We prank the Sphinx Module to replicate the production environment. In prod, the Sphinx
        // Module calls the Gnosis Safe.
        vm.startPrank(module);

        for (uint256 i = 0; i < txnArray.length; i++) {
            SphinxTransaction memory txn = txnArray[i];
            uint256 startGas = gasleft();
            bool success = safe.execTransactionFromModule(
                txn.to,
                txn.value,
                txn.txData,
                txn.operation
            );
            gasEstimates[i] = startGas - gasleft();
            require(success, "Sphinx: failed to call Gnosis Safe from Sphinx Module");
        }
        vm.stopPrank();

        return abi.encode(gasEstimates);
    }

    /**
     * @notice Sign a Sphinx Merkle root using a set of Gnosis Safe owner wallets. This exists here
     *         instead of `SphinxUtils` to ensure that the user's private key doesn't appear in a
     *         stack trace, which may occur if we call an external function on `SphinxUtils`.
     */
    function _sphinxSignMerkleRoot(
        Wallet[] memory _owners,
        bytes32 _merkleRoot
    ) private pure returns (bytes memory) {
        require(_owners.length > 0, "Sphinx: owners array must have at least one element");

        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _merkleRoot))
        );

        bytes memory signatures;
        for (uint256 i = 0; i < _owners.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(_owners[i].privateKey, keccak256(typedData));
            signatures = abi.encodePacked(signatures, r, s, v);
        }

        return signatures;
    }
}
