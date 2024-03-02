// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// We chose not to use any remappings when importing the standard forge library. This is because when our library is installed in
// the users project we will be subject to their configured remappings. Bugs can also occur if we rely on the users installation of
// forge-std which may not be the same exact version our library expects. To resolve both of these issues, we install the version of
// forge-std we need ourself. We then reference it using a relative import instead of a remapping because that prevents the user from
// having to define a separate remapping just for our installation of forge-std.
import { VmSafe, Vm } from "../../lib/forge-std/src/Vm.sol";

import { MerkleRootStatus, SphinxLeafWithProof } from "../core/SphinxDataTypes.sol";
import { ISphinxModule } from "../core/interfaces/ISphinxModule.sol";
import {
    SphinxMerkleTree,
    HumanReadableAction,
    Network,
    SphinxConfig,
    FoundryDeploymentInfo,
    NetworkInfo,
    Wallet,
    GnosisSafeTransaction,
    ExecutionMode,
    SystemContractInfo,
    ParsedAccountAccess,
    DeployedContractSize
} from "./SphinxPluginTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { IGnosisSafe } from "./interfaces/IGnosisSafe.sol";
import { IGnosisSafeProxyFactory } from "./interfaces/IGnosisSafeProxyFactory.sol";
import { SphinxForkCheck } from "./SphinxForkCheck.sol";

/**
 * @notice An abstract contract that the user must inherit in order to deploy with Sphinx.
 *         The main user-facing element of this contract is the `sphinx` modifier, which
 *         the user must include in their `run()` function. The rest of the logic is used
 *         internally by Sphinx to handle the process of collecting the user's contract
 *         deployments and function calls.
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
    SphinxConfig public sphinxConfig;

    SphinxConstants private constants;

    SphinxUtils private sphinxUtils;

    bool private sphinxModifierEnabled;

    constructor() {
        // Deploy the `SphinxUtils` and `SphinxConstants` helper contracts. We don't deploy these
        // using the `new` keyword because this causes an error when compiling with `viaIR` and the
        // optimizer enabled using solc v0.8.1.
        bytes memory utilsInitCode = vm.getCode("SphinxUtils.sol");
        bytes memory constantsInitCode = vm.getCode("SphinxConstants.sol");
        address utilsAddr;
        address constantsAddr;
        /// @solidity memory-safe-assembly
        assembly {
            utilsAddr := create(0, add(utilsInitCode, 0x20), mload(utilsInitCode))
            constantsAddr := create(0, add(constantsInitCode, 0x20), mload(constantsInitCode))
        }
        require(utilsAddr != address(0), "Sphinx: SphinxUtils deployment failed");
        require(constantsAddr != address(0), "Sphinx: SphinxConstants deployment failed");
        sphinxUtils = SphinxUtils(utilsAddr);
        constants = SphinxUtils(constantsAddr);

        // This ensures that these contracts stay deployed in a multi-fork environment (e.g. when
        // calling `vm.createSelectFork`).
        vm.makePersistent(address(constants));
        vm.makePersistent(address(sphinxUtils));
    }

    function configureSphinx() public virtual;

    /**
     * Fetches the sphinxConfig state variable. We need this because we call into this contract
     * from SphinxUtils to fetch the config. If we just called `sphinxConfig` directly, the dynamic
     * arrays would not be included in the return value.
     *
     * This is an external function because it is only intended to be used by the SphinxUtils contract
     * for fetching the unvalidated config from the sphinxConfig state variable.
     *
     * When fetching the config for normal usage in this contract, we should use the
     * `sphinxUtils.fetchAndValidateConfig()` function.
     */
    function sphinxFetchConfig() external view returns (SphinxConfig memory) {
        return sphinxConfig;
    }

    /**
     * @notice Validates the user's Sphinx dependencies. Must be backwards compatible with previous
     *         versions of the Sphinx plugin package and the Sphinx contracts library. Specifically:
     *         - The function name must stay the same.
     *         - There must be no input parameters.
     *         - The returned values must not be removed or changed. However, new return values can
     *           be added.
     */
    function sphinxValidate() external returns (string memory libraryVersion, bool forkInstalled) {
        libraryVersion = sphinxUtils.sphinxLibraryVersion();

        // Check that the user has a version of Foundry that records the state diff correctly
        // We don't assume this because our fixes were merged only recently (Feb 2024)
        vm.startStateDiffRecording();
        new SphinxForkCheck{ salt: 0 }();
        Vm.AccountAccess[] memory accountAccesses = vm.stopAndReturnStateDiff();
        forkInstalled = sphinxUtils.checkAccesses(
            accountAccesses,
            keccak256(type(SphinxForkCheck).creationCode),
            keccak256(type(SphinxForkCheck).runtimeCode)
        );

        return (libraryVersion, forkInstalled);
    }

    function sphinxCollectProposal(string memory _deploymentInfoPath) external {
        sphinxUtils.validateProposal(address(this));

        string memory serializedDeploymentInfo = sphinxCollect(
            ExecutionMode.Platform,
            constants.managedServiceAddress()
        );

        vm.writeFile(_deploymentInfoPath, serializedDeploymentInfo);
    }

    function sphinxCollectDeployment(
        ExecutionMode _executionMode,
        string memory _deploymentInfoPath,
        string memory _systemContractsFilePath
    ) external {
        address deployer;
        if (_executionMode == ExecutionMode.LiveNetworkCLI) {
            sphinxUtils.validateLiveNetworkCLI(sphinxConfig, IGnosisSafe(safeAddress()));
            deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        } else if (_executionMode == ExecutionMode.LocalNetworkCLI) {
            // Set the `ManagedService` contract as the deployer. Although this isn't strictly
            // necessary, it allows us to reuse the DevOps Platform logic for local network
            // broadcasts.
            deployer = constants.managedServiceAddress();
        } else {
            revert("Incorrect execution type.");
        }

        SystemContractInfo[] memory systemContracts = abi.decode(
            vm.parseBytes(vm.readFile(_systemContractsFilePath)),
            (SystemContractInfo[])
        );

        // Deploy the Sphinx system contracts. This is necessary because several Sphinx and Gnosis
        // Safe contracts are required to deploy a Gnosis Safe, which itself must be deployed
        // because we're going to call the Gnosis Safe to estimate the gas. Also, deploying the
        // Gnosis Safe ensures that its nonce is treated like a contract instead of an EOA.
        sphinxUtils.deploySphinxSystem(systemContracts);

        string memory serializedDeploymentInfo = sphinxCollect(_executionMode, deployer);
        vm.writeFile(_deploymentInfoPath, serializedDeploymentInfo);
    }

    function sphinxCollect(
        ExecutionMode _executionMode,
        address _executor
    ) private returns (string memory) {
        address safe = safeAddress();
        address module = sphinxModule();

        FoundryDeploymentInfo memory deploymentInfo;
        deploymentInfo.executionMode = _executionMode;
        deploymentInfo.executorAddress = _executor;
        deploymentInfo.safeAddress = safe;
        deploymentInfo.moduleAddress = module;
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.blockGasLimit = block.gaslimit;
        deploymentInfo.safeInitData = sphinxUtils.getGnosisSafeInitializerData(address(this));
        deploymentInfo.newConfig = SphinxConfig({
            projectName: sphinxConfig.projectName,
            owners: sphinxConfig.owners,
            threshold: sphinxConfig.threshold,
            orgId: sphinxConfig.orgId,
            mainnets: sphinxConfig.mainnets,
            testnets: sphinxConfig.testnets,
            saltNonce: sphinxConfig.saltNonce
        });
        deploymentInfo.initialState = sphinxUtils.getInitialChainState(safe, ISphinxModule(module));
        deploymentInfo.nonce = sphinxUtils.getMerkleRootNonce(ISphinxModule(module));
        deploymentInfo.sphinxLibraryVersion = sphinxUtils.getSphinxLibraryVersion();
        deploymentInfo.arbitraryChain = false;
        deploymentInfo.requireSuccess = true;

        // We fill the block number in later in Typescript. We have to do this using a call to the rpc provider
        // instead of using `block.number` within forge b/c some networks have odd changes to what `block.number`
        // means. For example, on Arbitrum` `block.number` returns the block number on ETH instead of Arbitrum.
        // This could cause the simulation to use an invalid block number and fail.
        deploymentInfo.blockNumber = 0;

        // Deploy the Gnosis Safe if it's not already deployed. This is necessary because we're
        // going to call the Gnosis Safe to estimate the gas.
        // This also also ensures that the safe's nonce is incremented as a contract instead of an EOA.
        if (address(safe).code.length == 0) {
            sphinxUtils.deployModuleAndGnosisSafe(
                sphinxConfig.owners,
                sphinxConfig.threshold,
                safe
            );
        }

        // Take a snapshot of the current state. We'll revert to the snapshot after we run the
        // user's script but before we execute the user's transactions via the Gnosis Safe to
        // estimate the Merkle leaf gas fields. It's necessary to revert the snapshot because the
        // gas estimation won't work if it runs against chain state where the user's transactions
        // have already occurred.
        uint256 snapshotId = vm.snapshot();

        vm.startStateDiffRecording();
        // Delegatecall the `run()` function on this contract to collect the transactions. This
        // pattern gives us flexibility to support function names other than `run()` in the future.
        (bool success, ) = address(this).delegatecall(abi.encodeWithSignature("run()"));
        // Throw an error if the deployment script fails. The error message in the user's script is
        // displayed by Foundry's stack trace, so it'd be redundant to include the data returned by
        // the delegatecall in our error message.
        require(success, "Sphinx: Deployment script failed.");
        Vm.AccountAccess[] memory accesses = vm.stopAndReturnStateDiff();
        ParsedAccountAccess[] memory parsedAccesses = sphinxUtils.parseAccountAccesses(
            accesses,
            safe
        );

        deploymentInfo.encodedDeployedContractSizes = abi.encode(
            sphinxUtils.fetchDeployedContractSizes(accesses)
        );

        // ABI encode each `ParsedAccountAccess` element individually. If, instead, we ABI encode
        // the entire array as a unit, the encoded bytes will be too large for EthersJS to ABI
        // decode, which causes an error. This occurs for large deployments, i.e. greater than 50
        // contracts.
        deploymentInfo.encodedAccountAccesses = new bytes[](parsedAccesses.length);
        for (uint256 i = 0; i < parsedAccesses.length; i++) {
            deploymentInfo.encodedAccountAccesses[i] = abi.encode(parsedAccesses[i]);
        }

        vm.revertTo(snapshotId);
        deploymentInfo.gasEstimates = _sphinxEstimateMerkleLeafGas(
            parsedAccesses,
            IGnosisSafe(safe),
            module
        );

        return sphinxUtils.serializeFoundryDeploymentInfo(deploymentInfo);
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

        bytes memory safeInitializerData = sphinxUtils.getGnosisSafeInitializerData(address(this));

        // This is the transaction that deploys the Gnosis Safe, deploys the Sphinx Module,
        // and enables the Sphinx Module in the Gnosis Safe.
        safeProxyFactory.createProxyWithNonce(
            singletonAddress,
            safeInitializerData,
            sphinxConfig.saltNonce
        );
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
            callerMode != VmSafe.CallerMode.RecurrentBroadcast,
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

        sphinxUtils.fetchAndValidateConfig(address(this));

        // Prank the Gnosis Safe then execute the user's script. We prank the Gnosis
        // Safe to replicate the production environment.
        vm.startPrank(safeAddress());
        _;
        vm.stopPrank();

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);

        sphinxModifierEnabled = false;
    }

    /**
     * @notice Get the address of the SphinxModule. Before calling this function, the
     *         `sphinxConfig.owners` array and `sphinxConfig.threshold` must be set.
     */
    function sphinxModule() public returns (address) {
        return sphinxUtils.getSphinxModuleAddress(address(this));
    }

    /**
     * @notice Get the address of the Gnosis Safe. Before calling this function, the
     *         `sphinxConfig.owners` array and `sphinxConfig.threshold` must be set.
     */
    function safeAddress() public returns (address) {
        return sphinxUtils.getGnosisSafeProxyAddress(address(this));
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

    /**
     * @notice Return the user's config ABI encoded. This is useful for retrieving the config
     *         off-chain. We ABI encode the config because it's difficult to decode complex
     *         data types that are returned by invoking Forge scripts.
     */
    function sphinxConfigABIEncoded() public returns (bytes memory) {
        SphinxConfig memory config = sphinxUtils.fetchAndValidateConfig(address(this));
        return abi.encode(config, safeAddress(), sphinxModule());
    }

    /**
     * @notice Estimates the values of the `gas` fields in the Merkle leaves using `gasleft`. This
     *         provides a more accurate estimate than simulating the transactions for two reasons:
     *         1. The `eth_estimateGas` RPC method includes the minimum gas limit (21k) and the
     *            calldata cost of initiating the transaction, which shouldn't be factored into the
     *            Merkle leaf's `gas` field because it's executed as a sub-call.
     *         2. It could be possible to underestimate the Merkle leaf's gas using a simulation due
     *            to gas refunds. Consider this (contrived) edge case: Say a user's transaction
     *            deploys a contract, which costs ~2 million gas, and also involves a large gas
     *            refund (~500k gas). Since gas refunds occur after the transaction is executed, the
     *            broadcast file will have a gas estimate of ~1.5 million gas. However, the user's
     *            transaction costs 2 million gas. This will cause Sphinx to underestimate the
     *            Merkle leaf's gas, resulting in a failed deployment on-chain. This situation uses
     *            contrived numbers, but the point is that using `gasleft` is accurate even if
     *            there's a large gas refund.
     */
    function _sphinxEstimateMerkleLeafGas(
        ParsedAccountAccess[] memory _accountAccesses,
        IGnosisSafe _safe,
        address _moduleAddress
    ) private returns (uint256[] memory) {
        uint256[] memory gasEstimates = new uint256[](_accountAccesses.length);

        // We prank the Sphinx Module to replicate the production environment. In prod, the Sphinx
        // Module calls the Gnosis Safe.
        vm.startPrank(_moduleAddress);

        for (uint256 i = 0; i < _accountAccesses.length; i++) {
            ParsedAccountAccess memory parsed = _accountAccesses[i];
            GnosisSafeTransaction memory txn = sphinxUtils.makeGnosisSafeTransaction(parsed.root);
            uint256 startGas = gasleft();
            bool success = _safe.execTransactionFromModule(
                txn.to,
                txn.value,
                txn.txData,
                txn.operation
            );
            uint256 finalGas = gasleft();

            require(success, "Sphinx: failed to call Gnosis Safe from Sphinx Module");

            // Include a buffer to ensure the user's transaction doesn't fail on-chain due to
            // variations between the simulation and the live execution environment. There are a
            // couple areas in particular that could lead to variations:
            // 1. The on-chain state could vary, which could impact the cost of execution. This is
            //    inherently a source of variation because there's a delay between the simulation
            //    and execution.
            // 2. Foundry's simulation is treated as a single transaction, which means SLOADs are
            //    more likely to be "warm" (i.e. cheaper) than the production environment, where
            //    transactions may be split between batches.
            //
            // Collecting the user's transactions in the same process as this function does not
            // impact the Merkle leaf gas fields because we use `vm.snapshot`/`vm.revertTo`. Also,
            // state changes on one fork do not impact the gas cost on other forks.
            //
            // We chose to multiply the gas by 1.1 because multiplying it by a higher number could
            // make a very large transaction unexecutable on-chain. Since the 1.1x multiplier
            // doesn't impact small transactions very much, we add a constant amount of 60k too.
            gasEstimates[i] = 60_000 + ((startGas - finalGas) * 11) / 10;
        }

        vm.stopPrank();

        return gasEstimates;
    }
}
