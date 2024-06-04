// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// We chose not to use any remappings when importing the standard forge library. This is because when our library is installed in
// the users project we will be subject to their configured remappings. Bugs can also occur if we rely on the users installation of
// forge-std which may not be the same exact version our library expects. To resolve both of these issues, we install the version of
// forge-std we need ourself. We then reference it using a relative import instead of a remapping because that prevents the user from
// having to define a separate remapping just for our installation of forge-std.
import { VmSafe, Vm } from "../../contracts/forge-std/src/Vm.sol";

import { MerkleRootStatus, SphinxLeafWithProof } from "../core/SphinxDataTypes.sol";
import { ISphinxModule } from "../core/interfaces/ISphinxModule.sol";
import {
    SphinxMerkleTree,
    HumanReadableAction,
    Network,
    FoundryDeploymentInfo,
    NetworkInfo,
    Wallet,
    GnosisSafeTransaction,
    ExecutionMode,
    SystemContractInfo,
    UserSphinxConfig
} from "./SphinxPluginTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { IGnosisSafe } from "./interfaces/IGnosisSafe.sol";
import { IGnosisSafeProxyFactory } from "./interfaces/IGnosisSafeProxyFactory.sol";
import { SphinxForkCheck } from "./SphinxForkCheck.sol";

/**
 * @notice An abstract contract that the user must inherit in order to deploy with Sphinx.
 *         The main user-facing element of this contract is the `sphinx` modifier, which
 *         the user must include in their entry point function. The rest of the logic is used
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

    /**
     * @dev The configuration options for the user's project. This variable must have `internal`
     *      visibility so that the user can set fields on it.
     */
    UserSphinxConfig public sphinxConfig;

    SphinxConstants private constants;

    SphinxUtils private sphinxUtils;

    bool private sphinxModifierEnabled;

    /**
     * @dev Tracks the amount of funding we need to transfer to the safe at the beginning of the deployment
     *      We use a mapping for this and for the Safe starting balance because the user may have a complex
     *      script that forks multiple different networks internally. See the `test_fundSafe_success_multifork`
     *      test in Sphinx.t.sol for an example of this case.
     *      chain => funds requested
     */
    mapping(uint256 => uint256) private fundsRequestedForSafe;

    /**
     * @dev Tracks the starting balance of the Safe.
     *      chainId => starting balance
     */
    mapping(uint256 => uint256) private safeStartingBalance;

    constructor() {
        sphinxUtils = new SphinxUtils();
        constants = new SphinxConstants();

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
    function sphinxFetchConfig() external view returns (UserSphinxConfig memory) {
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

    function sphinxCollectProposal(
        bytes memory _scriptFunctionCalldata,
        string memory _deploymentInfoPath,
        uint64 _callDepth
    ) external returns (FoundryDeploymentInfo memory) {
        sphinxUtils.validateProposal(address(this));

        FoundryDeploymentInfo memory deploymentInfo = sphinxCollect(
            ExecutionMode.Platform,
            constants.permissionlessRelayAddress(),
            _scriptFunctionCalldata,
            _callDepth
        );

        vm.writeFile(
            _deploymentInfoPath,
            sphinxUtils.serializeFoundryDeploymentInfo(deploymentInfo)
        );

        return deploymentInfo;
    }

    function sphinxCollectDeployment(
        bytes memory _scriptFunctionCalldata,
        ExecutionMode _executionMode,
        string memory _deploymentInfoPath,
        string memory _systemContractsFilePath
    ) external {
        address deployer;
        if (_executionMode == ExecutionMode.LiveNetworkCLI) {
            sphinxUtils.validateLiveNetworkCLI(IGnosisSafe(safeAddress()), address(this));
            deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        } else if (_executionMode == ExecutionMode.LocalNetworkCLI) {
            // Set the `ManagedService` contract as the deployer. Although this isn't strictly
            // necessary, it allows us to reuse the DevOps Platform logic for local network
            // broadcasts.
            deployer = constants.permissionlessRelayAddress();
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

        FoundryDeploymentInfo memory deploymentInfo = sphinxCollect(
            _executionMode,
            deployer,
            _scriptFunctionCalldata,
            2
        );
        vm.writeFile(
            _deploymentInfoPath,
            sphinxUtils.serializeFoundryDeploymentInfo(deploymentInfo)
        );
    }

    function sphinxCollect(
        ExecutionMode _executionMode,
        address _executor,
        bytes memory _scriptFunctionCalldata,
        uint64 _callDepth
    ) private returns (FoundryDeploymentInfo memory) {
        address safe = safeAddress();

        FoundryDeploymentInfo memory deploymentInfo = sphinxUtils.initializeDeploymentInfo(
            sphinxConfig,
            _executionMode,
            _executor,
            address(this)
        );

        // Deploy the Gnosis Safe if it's not already deployed. This is necessary because we're
        // going to call the Gnosis Safe to estimate the gas.
        // This also also ensures that the safe's nonce is incremented as a contract instead of an EOA.
        if (address(safe).code.length == 0) {
            sphinxUtils.deployModuleAndGnosisSafe(
                deploymentInfo.newConfig.owners,
                deploymentInfo.newConfig.threshold,
                safe
            );
        }

        // Take a snapshot of the current state. We'll revert to the snapshot after we run the
        // user's script but before we execute the user's transactions via the Gnosis Safe to
        // estimate the Merkle leaf gas fields. It's necessary to revert the snapshot because the
        // gas estimation won't work if it runs against chain state where the user's transactions
        // have already occurred.
        uint256 snapshotId = vm.snapshot();

        // Record the starting balance of the Safe
        safeStartingBalance[deploymentInfo.chainId] = safeAddress().balance;

        vm.startStateDiffRecording();
        // Delegatecall the entry point function on this contract to collect the transactions.
        (bool success, ) = address(this).delegatecall(_scriptFunctionCalldata);
        // Throw an error if the deployment script fails. The error message in the user's script is
        // displayed by Foundry's stack trace, so it'd be redundant to include the data returned by
        // the delegatecall in our error message.
        require(success, "Sphinx: Deployment script failed.");
        Vm.AccountAccess[] memory accesses = vm.stopAndReturnStateDiff();
        // Set the `deployedCode` field for each AccountAccess of kind `Create`. There may be a bug
        // in Foundry that causes this field to not always be populated.
        for (uint256 i = 0; i < accesses.length; i++) {
            if (accesses[i].kind == VmSafe.AccountAccessKind.Create) {
                accesses[i].deployedCode = accesses[i].account.code;
            }
        }

        // We have to copy fundsRequestedForSafe and safeStartingBalance into deploymentInfo before
        // calling vm.revertTo because that cheatcode will clear the state variables.
        deploymentInfo.fundsRequestedForSafe = fundsRequestedForSafe[deploymentInfo.chainId];
        deploymentInfo.safeStartingBalance = safeStartingBalance[deploymentInfo.chainId];

        // Check that the amount of funds requested for the Safe is valid
        sphinxUtils.checkValidSafeFundingRequest(
            deploymentInfo.fundsRequestedForSafe,
            deploymentInfo.chainId
        );

        vm.revertTo(snapshotId);

        return
            sphinxUtils.finalizeDeploymentInfo(deploymentInfo, accesses, _callDepth, address(this));
    }

    /**
     * @notice A modifier that the user must include on their entry point function when using Sphinx.
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

    /**
     * @notice Utility function that allows the user to transfer funds to their Safe at
     * the beginning of a deployment. A utility function is required for this (vs just
     * using _to.call{value: _amount} or transfer()) because this features involves the
     * DevOps platform transferring funds directly to the safe from an EOA as part of the
     * deployment. _to.call{value: _amount} or transfer() can be used to transfer value
     * from the Safe to other addresses.
     */
    function fundSafe(uint _value) public {
        fundsRequestedForSafe[block.chainid] += _value;

        // Update the balance of the safe to equal to Safe's current balance + the
        // value that we will transfer to the Safe during the deployment.
        address safe = safeAddress();
        vm.deal(safe, safe.balance + _value);
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
    function userSphinxConfigABIEncoded() public returns (bytes memory) {
        UserSphinxConfig memory config = sphinxUtils.fetchAndValidateConfig(address(this));
        return abi.encode(config, safeAddress(), sphinxModule());
    }
}
