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
    DeploymentInfo,
    NetworkInfo,
    Wallet,
    SphinxTransaction,
    ExecutionMode,
    SystemContractInfo
} from "./SphinxPluginTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { IGnosisSafe } from "./interfaces/IGnosisSafe.sol";
import { IGnosisSafeProxyFactory } from "./interfaces/IGnosisSafeProxyFactory.sol";

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

    bool private isCollecting;

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

    function sphinxCollectProposal(string memory _deploymentInfoPath) external {
        sphinxUtils.validateProposal(sphinxConfig);

        DeploymentInfo memory deploymentInfo = sphinxCollect(
            ExecutionMode.Platform,
            constants.managedServiceAddress()
        );

        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxCollectDeployment(
        ExecutionMode _executionMode,
        string memory _deploymentInfoPath
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

        DeploymentInfo memory deploymentInfo = sphinxCollect(_executionMode, deployer);
        vm.writeFile(_deploymentInfoPath, vm.toString(abi.encode(deploymentInfo)));
    }

    function sphinxCollect(
        ExecutionMode _executionMode,
        address _executor
    ) private returns (DeploymentInfo memory) {
        address safe = safeAddress();
        address module = sphinxModule();

        DeploymentInfo memory deploymentInfo;
        deploymentInfo.executionMode = _executionMode;
        deploymentInfo.executorAddress = _executor;
        deploymentInfo.safeAddress = safe;
        deploymentInfo.moduleAddress = module;
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.blockGasLimit = block.gaslimit;
        deploymentInfo.safeInitData = sphinxUtils.getGnosisSafeInitializerData(
            sphinxConfig.owners,
            sphinxConfig.threshold
        );
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
        deploymentInfo.arbitraryChain = false;
        deploymentInfo.requireSuccess = true;

        isCollecting = true;

        // Delegatecall the `run()` function on this contract to collect the transactions. This
        // pattern gives us flexibility to support function names other than `run()` in the future.
        (bool success, ) = address(this).delegatecall(abi.encodeWithSignature("run()"));
        // Throw an error if the deployment script fails. The error message in the user's script is
        // displayed by Foundry's stack trace, so it'd be redundant to include the data returned by
        // the delegatecall in our error message.
        require(success, "Sphinx: Deployment script failed.");

        return deploymentInfo;
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
            callerMode != VmSafe.CallerMode.RecurrentBroadcast || isCollecting,
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

        if (isCollecting) {
            // Execute the user's 'run()' function.
            vm.startBroadcast(safeAddress());
            _;
            vm.stopBroadcast();
        } else {
            // Prank the Gnosis Safe then execute the user's `run()` function. We prank the Gnosis
            // Safe to replicate the deployment process on live networks.
            vm.startPrank(safeAddress());
            _;
            vm.stopPrank();
        }

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);

        sphinxModifierEnabled = false;
    }

    /**
     * @notice Get the address of the SphinxModule. Before calling this function, the
     *         `sphinxConfig.owners` array and `sphinxConfig.threshold` must be set.
     */
    function sphinxModule() public view returns (address) {
        return sphinxUtils.getSphinxModuleAddress(sphinxConfig);
    }

    /**
     * @notice Get the address of the Gnosis Safe. Before calling this function, the
     *         `sphinxConfig.owners` array and `sphinxConfig.threshold` must be set.
     */
    function safeAddress() public view returns (address) {
        return sphinxUtils.getGnosisSafeProxyAddress(sphinxConfig);
    }

    function sphinxLibraryVersion() public view returns (string memory) {
        return sphinxUtils.getSphinxLibraryVersion();
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
    function sphinxConfigABIEncoded() external view returns (bytes memory) {
        return abi.encode(sphinxConfig, safeAddress(), sphinxModule());
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
     *
     * @return abiEncodedGasArray The ABI encoded array of gas estimates. There's one element per
     *                            `EXECUTE` Merkle leaf. We ABI encode the array because Foundry
     *                            makes it difficult to reliably parse complex data types off-chain.
     *                            Specifically, an array element looks like this in the returned
     *                            JSON: `27222 [2.722e4]`.
     */
    function sphinxEstimateMerkleLeafGas(
        string memory _leafGasParamsFilePath
    ) external returns (bytes memory abiEncodedGasArray) {
        (SphinxTransaction[] memory txnArray, SystemContractInfo[] memory systemContracts) = abi
            .decode(
                vm.parseBytes(vm.readFile(_leafGasParamsFilePath)),
                (SphinxTransaction[], SystemContractInfo[])
            );

        // Deploy the Sphinx system contracts. This is necessary because several Sphinx and Gnosis
        // Safe contracts are required to deploy a Gnosis Safe, which itself must be deployed
        // because we're going to call the Gnosis Safe to estimate the gas. Also, this is necessary
        // because the system contracts may not already be deployed on the current network.
        sphinxUtils.deploySphinxSystem(systemContracts);

        IGnosisSafe safe = IGnosisSafe(safeAddress());
        address module = sphinxModule();
        address managedServiceAddress = constants.managedServiceAddress();

        uint256[] memory gasEstimates = new uint256[](txnArray.length);

        // Deploy the Gnosis Safe if it's not already deployed. This is necessary because we're
        // going to call the Gnosis Safe to estimate the gas.
        if (address(safe).code.length == 0) {
            // Deploy the Gnosis Safe and Sphinx Module. It's not strictly necessary to prank the
            // Managed Service contract, but this replicates the prod environment for the DevOps
            // Platform, so we do it anyways.
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
}
