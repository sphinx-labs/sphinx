// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    DeploymentState,
    ChugSplashAction,
    ChugSplashTarget,
    ChugSplashActionType,
    DeploymentStatus
} from "./ChugSplashDataTypes.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { IProxyAdapter } from "./interfaces/IProxyAdapter.sol";
import {
    Lib_MerkleTree as MerkleTree
} from "@eth-optimism/contracts/libraries/utils/Lib_MerkleTree.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { ICreate3 } from "./interfaces/ICreate3.sol";
import { Semver, Version } from "./Semver.sol";
import { IGasPriceCalculator } from "./interfaces/IGasPriceCalculator.sol";
import {
    ERC2771ContextUpgradeable
} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {
    ContextUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

/**
 * @title ChugSplashManager
 * @custom:version 1.0.0
 * @notice This contract contains the logic for managing the entire lifecycle of a project's
   deployments. It contains the functionality for proposing, approving, and executing deployments,
   paying remote executors, and exporting proxies out of the ChugSplash system if desired. It exists
   as a single implementation contract behind ChugSplashManagerProxy contracts.

   After a deployment is approved, it is executed in the following steps, which must occur in order.
    1. Execute all of the `DEPLOY_CONTRACT` actions using the `executeActions` function. This is
       first because it's possible for the constructor of a deployed contract to revert. If this
       happens, we cancel the deployment before the proxies are modified in any way.
    2. The `initiateProxies` function.
    3. Execute all of the `SET_STORAGE` actions using the `executeActions` function.
    4. The `completeUpgrade` function.
 */
contract ChugSplashManager is
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    Semver,
    IChugSplashManager,
    ERC2771ContextUpgradeable
{
    /**
     * @notice Role required to be a remote executor for a deployment.
     */
    bytes32 internal constant REMOTE_EXECUTOR_ROLE = keccak256("REMOTE_EXECUTOR_ROLE");

    /**
     * @notice Role required to propose deployments through the ManagedService contract.
     */
    bytes32 internal constant MANAGED_PROPOSER_ROLE = keccak256("MANAGED_PROPOSER_ROLE");

    /**
     * @notice The contract kind hash for contracts that do not use a proxy (i.e. immutable
       contracts).
     */
    bytes32 internal constant NO_PROXY_CONTRACT_KIND_HASH = keccak256("no-proxy");

    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Address of the Create3 contract.
     */
    address public immutable create3;

    /**
     * @notice Address of the GasPriceCalculator contract.
     */
    IGasPriceCalculator public immutable gasPriceCalculator;

    /**
     * @notice Address of the ManagedService contract.
     */
    IAccessControl public immutable managedService;

    /**
     * @notice Amount that must be stored in this contract in order to remotely execute a
       deployment. It is not necessary to deposit this amount if the owner is self-executing their
       deployment. The bond can be deposited by any account.

       The owner can withdraw this amount whenever a deployment is not active. However, this amount
       will be forfeited if the owner cancels a deployment that is in progress and within the
       `executionLockTime`. This is necessary to prevent owners from trolling the remote executor by
       immediately cancelling and withdrawing funds.
     */
    uint256 public immutable ownerBondAmount;

    /**
     * @notice Amount of time for a remote executor to finish executing a deployment once they have
       claimed it.
     */
    uint256 public immutable executionLockTime;

    /**
     * @notice Percentage that the remote executor profits from a deployment. This is denominated as
       a percentage of the cost of execution. For example, if a deployment costs 1 gwei to execute
       and the executorPaymentPercentage is 10, then the executor will profit 0.1 gwei.
     */
    uint256 public immutable executorPaymentPercentage;

    /**
     * @notice Percentage that the protocol creators profit during a remotely executed deployment.
       This is denominated as a percentage of the cost of execution. For example, if a deployment
       costs 1 gwei to execute and the protocolPaymentPercentage is 10, then the protocol will
       profit 0.1 gwei. Note that the protocol does not profit during a self-executed deployment.
     */
    uint256 public immutable protocolPaymentPercentage;

    /**
     * @notice Mapping of executor addresses to the ETH amount stored in this contract that is
     *         owed to them.
     */
    mapping(address => uint256) public executorDebt;

    /**
     * @notice Maps an address to a boolean indicating if the address has been approved by the owner
       to propose deployments. Note that this does include proposers from the managed service (see
       `isProposer`).
     */
    mapping(address => bool) public proposers;

    /**
     * @notice Mapping of deployment IDs to deployment state.
     */
    mapping(bytes32 => DeploymentState) internal _deployments;

    /**
     * @notice Organization ID for this contract.
     */
    bytes32 public organizationID;

    /**
     * @notice ID of the currently active deployment.
     */
    bytes32 public activeDeploymentId;

    /**
     * @notice Total ETH amount stored in this contract that is owed to remote executors.
     */
    uint256 public totalExecutorDebt;

    /**
     * @notice Total ETH amount stored in this contract that is owed to the protocol creators.
     */
    uint256 public totalProtocolDebt;

    /**
     * @notice A boolean indicating if the owner of this contract has approved the ManagedService
       contract to propose deployments on their behalf.
     */
    bool public allowManagedProposals;

    /**
     * @notice Emitted when a deployment is proposed.

     * @param deploymentId   ID of the deployment that was proposed.
     * @param actionRoot   Root of the Merkle tree containing the actions for the deployment.
     * @param targetRoot   Root of the Merkle tree containing the targets for the deployment.
     * @param numActions   Number of actions in the deployment.
     * @param numTargets   Number of targets in the deployment.
     * @param numNonProxyContracts   Number of non-proxy contracts in the deployment.
     * @param configUri  URI of the config file that can be used to fetch the deployment.
     * @param remoteExecution Boolean indicating if the deployment should be remotely executed.
     * @param proposer     Address of the account that proposed the deployment.
     */
    event ChugSplashDeploymentProposed(
        bytes32 indexed deploymentId,
        bytes32 actionRoot,
        bytes32 targetRoot,
        uint256 numActions,
        uint256 numTargets,
        uint256 numNonProxyContracts,
        string configUri,
        bool remoteExecution,
        address proposer
    );

    /**
     * @notice Emitted when a ChugSplash deployment is approved.
     *
     * @param deploymentId ID of the deployment that was approved.
     */
    event ChugSplashDeploymentApproved(bytes32 indexed deploymentId);

    /**
     * @notice Emitted when a storage slot in a proxy is modified.
     *
     * @param deploymentId Current deployment ID.
     * @param proxy        Address of the proxy.
     * @param executor Address of the caller for this transaction.
     * @param actionIndex Index of this action.
     */
    event SetProxyStorage(
        bytes32 indexed deploymentId,
        address indexed proxy,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a deployment is initiated.
     *
     * @param deploymentId   ID of the active deployment.
     * @param executor        Address of the caller that initiated the deployment.
     */
    event ProxiesInitiated(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when a deployment is completed.
     *
     * @param deploymentId   ID of the active deployment.
     * @param executor        Address of the caller that initiated the deployment.
     */
    event ChugSplashDeploymentCompleted(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when the owner of this contract cancels an active deployment.
     *
     * @param deploymentId        Deployment ID that was cancelled.
     * @param owner           Address of the owner that cancelled the deployment.
     * @param actionsExecuted Total number of completed actions before cancellation.
     */
    event ChugSplashDeploymentCancelled(
        bytes32 indexed deploymentId,
        address indexed owner,
        uint256 actionsExecuted
    );

    /**
     * @notice Emitted when ownership of a proxy is transferred away from this contract.
     *
     * @param proxy            Address of the proxy that was exported.
     * @param contractKindHash The proxy's contract kind hash, which indicates the proxy's type.
     * @param newOwner         Address of the new owner of the proxy.
     */
    event ProxyExported(address indexed proxy, bytes32 indexed contractKindHash, address newOwner);

    /**
     * @notice Emitted when a deployment is claimed by a remote executor.
     *
     * @param deploymentId ID of the deployment that was claimed.
     * @param executor Address of the executor that claimed the deployment.
     */
    event ChugSplashDeploymentClaimed(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when an executor claims a payment.
     *
     * @param executor The executor being paid.
     * @param withdrawn   Amount of ETH withdrawn.
     * @param remaining  Amount of ETH remaining to be withdrawn by the executor.
     */
    event ExecutorPaymentClaimed(address indexed executor, uint256 withdrawn, uint256 remaining);

    /**
     * @notice Emitted when the owner withdraws ETH from this contract.
     *
     * @param owner  Address of the owner.
     * @param amount ETH amount withdrawn.
     */
    event OwnerWithdrewETH(address indexed owner, uint256 amount);

    /**
     * @notice Emitted when the owner of this contract adds or removes a proposer.
     *
     * @param proposer Address of the proposer that was added or removed.
     * @param isProposer Boolean indicating if the proposer was added or removed.
     * @param owner Address of the owner.
     */
    event ProposerSet(address indexed proposer, bool indexed isProposer, address indexed owner);

    /**
     * @notice Emitted when the owner of this contract toggles the ability of the ManagedService
       contract to propose deployments.
     *
        * @param isManaged Boolean indicating if the ManagedService contract is allowed to propose
          deployments.
        * @param owner Address of the owner.
     */
    event ToggledManagedProposals(bool isManaged, address indexed owner);

    /**
     * @notice Emitted when ETH is deposited in this contract.
     *
     * @param from   Address of the account that deposited ETH.
     * @param amount ETH amount deposited.
     */
    event ETHDeposited(address indexed from, uint256 indexed amount);

    /**
     * @notice Emitted when a Proxy is deployed by this contract.
     *
     * @param salt           Salt used to deploy the proxy.
     * @param proxy          Address of the deployed proxy.
     * @param deploymentId   ID of the deployment in which the proxy was deployed.
     * @param projectName    Name of the project that the proxy belongs to.
     * @param referenceName  Reference name that corresponds to this proxy.
     */
    event DefaultProxyDeployed(
        bytes32 indexed salt,
        address indexed proxy,
        bytes32 indexed deploymentId,
        string projectName,
        string referenceName
    );

    /**
     * @notice Emitted when a contract is deployed by this contract.
     *
     * @param referenceNameHash Hash of the reference name that corresponds to this contract.
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param referenceName     String reference name.
     * @param actionIndex Index of the action that deployed the contract.
     * @param creationCodeWithArgsHash Hash of the creation code with constructor args.
     */
    event ContractDeployed(
        string indexed referenceNameHash,
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        string referenceName,
        uint256 actionIndex,
        bytes32 creationCodeWithArgsHash
    );

    /**
     * @notice Emitted when a contract deployment is skipped. This occurs when a contract already
       exists at the Create3 address.
     *
     * @param referenceNameHash Hash of the reference name that corresponds to this contract.
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param referenceName     String reference name.
     * @param actionIndex Index of the action that attempted to deploy the contract.
     */
    event ContractDeploymentSkipped(
        string indexed referenceNameHash,
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        string referenceName,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a deployment fails. This should only occur if the constructor of a
       deployed contract reverts.
     *
     * @param referenceNameHash Hash of the reference name that corresponds to this contract.
     * @param expectedAddress   Expected Create3 address of the contract.
     * @param deploymentId      ID of the deployment in which the contract deployment was attempted.
     * @param referenceName     String reference name.
     * @param actionIndex Index of the action that attempted to deploy the contract.
     */
    event DeploymentFailed(
        string indexed referenceNameHash,
        address indexed expectedAddress,
        bytes32 indexed deploymentId,
        string referenceName,
        uint256 actionIndex
    );

    /**
     * @notice Reverts if the caller is not a remote executor.
     */
    error CallerIsNotRemoteExecutor();

    /**
     * @notice Reverts if the caller is not a proposer.
     */
    error CallerIsNotProposer();

    /**
     * @notice Reverts if the deployment state is not proposable.
     */
    error DeploymentStateIsNotProposable();

    /**
     * @notice Reverts if there isn't at least `OWNER_BOND_AMOUNT` in this contract. Only applies
       to deployments that will be remotely executed.
     */
    error InsufficientOwnerBond();

    /**
     * @notice Reverts if the deployment state is not proposed.
     */
    error DeploymentIsNotProposed();

    /**
     * @notice Reverts if there is another active deployment ID.
     */
    error AnotherDeploymentInProgress();

    /**
     * @notice Reverts if there is currently no active deployment ID.
     */
    error NoActiveDeployment();

    /**
     * @notice Reverts if a deployment can only be self-executed by the owner.
     */
    error RemoteExecutionDisabled();

    /**
     * @notice Reverts if the deployment has already been claimed by another remote executor.
     */
    error DeploymentAlreadyClaimed();

    /**
     * @notice Reverts if the amount equals zero.
     */
    error AmountMustBeGreaterThanZero();

    /**
     * @notice Reverts if the remote executor has insufficient debt in this contract.
     */
    error InsufficientExecutorDebt();

    /**
     * @notice Reverts if there's not enough funds in the contract pay the protocol fee and the
     *  withdraw amount requested by the executor.
     */
    error InsufficientFunds();

    /**
     * @notice Reverts if a withdrawal transaction fails. This is likely due to insufficient funds
       in this contract.
     */
    error WithdrawalFailed();

    /**
     * @notice Reverts if there is no bytecode at a given address.
     */
    error ContractDoesNotExist();

    /**
     * @notice Reverts if an invalid contract kind is provided.
     */
    error InvalidContractKind();

    /**
     * @notice Reverts if the call to export ownership of a proxy from this contract fails.
     */
    error ProxyExportFailed();

    /**
     * @notice Reverts if an empty actions array is provided as input to the transaction.
     */
    error EmptyActionsArray();

    /**
     * @notice Reverts if the action has already been executed in this deployment.
     */
    error ActionAlreadyExecuted();

    /**
     * @notice Reverts if an invalid Merkle proof is provided.
     */
    error InvalidMerkleProof();

    /**
     * @notice Reverts if the action type is not `DEPLOY_CONTRACT` or `SET_STORAGE`.
     */
    error InvalidActionType();

    /**
     * @notice Reverts if an upgrade is initiated before all of the contracts are deployed via
       `executeActions`.
     */
    error InitiatedUpgradeTooEarly();

    /**
     * @notice Reverts if the deployment is not in the `APPROVED` state.
     */
    error DeploymentIsNotApproved();

    /**
     * @notice Reverts if the provided number of targets does not match the actual number of targets
       in the deployment.
     */
    error IncorrectNumberOfTargets();

    /**
     * @notice Reverts if a non-proxy contract type is used instead of a proxy type.
     */
    error OnlyProxiesAllowed();

    /**
     * @notice Reverts if the contract creation for a `Proxy` fails.
     */
    error ProxyDeploymentFailed();

    /**
     * @notice Reverts if the call to initiate an upgrade on a proxy fails.
     */
    error FailedToInitiateUpgrade();

    /**
     * @notice Reverts if an upgrade is completed before all of the actions have been executed.
     */
    error FinalizedUpgradeTooEarly();

    /**
     * @notice Reverts if the call to finalize an upgrade on a proxy fails.
     */
    error FailedToFinalizeUpgrade();

    /**
     * @notice Reverts if the deployment is not in the `PROXIES_INITIATED` state.
     */
    error ProxiesAreNotInitiated();

    /**
     * @notice Reverts if the call to modify a proxy's storage slot value fails.
     */
    error SetStorageFailed();

    /**
     * @notice Reverts if the caller is not a selected executor.
     */
    error CallerIsNotSelectedExecutor();

    /**
     * @notice Reverts if the caller is not the owner.
     */
    error CallerIsNotOwner();

    /**
     * @notice Reverts if the low-level delegatecall to get an address fails.
     */
    error FailedToGetAddress();

    /**
     * @notice Reverts if a contract fails to be deployed.
     */
    error FailedToDeployContract();

    /**
     * @notice Modifier that reverts if the caller is not a remote executor.
     */
    modifier onlyExecutor() {
        if (!managedService.hasRole(REMOTE_EXECUTOR_ROLE, _msgSender())) {
            revert CallerIsNotRemoteExecutor();
        }
        _;
    }

    /**
     * @param _registry                  Address of the ChugSplashRegistry.
     * @param _create3                   Address of the Create3 contract.
     * @param _gasPriceCalculator        Address of the GasPriceCalculator contract.
     * @param _managedService            Address of the ManagedService contract.
     * @param _executionLockTime         Amount of time for a remote executor to completely execute
       a deployment after claiming it.
     * @param _ownerBondAmount           Amount that must be deposited in this contract in order to
     *                                   remote execute a deployment.
     * @param _executorPaymentPercentage Percentage that an executor will profit from completing a
       deployment.
     * @param _protocolPaymentPercentage Percentage that the protocol creators will profit from
         completing a deployment.
     * @param _version                   Version of this contract.
     */
    constructor(
        ChugSplashRegistry _registry,
        address _create3,
        IGasPriceCalculator _gasPriceCalculator,
        IAccessControl _managedService,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount,
        uint256 _executorPaymentPercentage,
        uint256 _protocolPaymentPercentage,
        Version memory _version,
        address _trustedForwarder
    )
        Semver(_version.major, _version.minor, _version.patch)
        ERC2771ContextUpgradeable(_trustedForwarder)
    {
        registry = _registry;
        create3 = _create3;
        gasPriceCalculator = _gasPriceCalculator;
        managedService = _managedService;
        executionLockTime = _executionLockTime;
        ownerBondAmount = _ownerBondAmount;
        executorPaymentPercentage = _executorPaymentPercentage;
        protocolPaymentPercentage = _protocolPaymentPercentage;
    }

    /**
     * @notice Allows anyone to send ETH to this contract.
     */
    receive() external payable {
        emit ETHDeposited(_msgSender(), msg.value);
        registry.announce("ETHDeposited");
    }

    /**
     * @inheritdoc IChugSplashManager
     *
     * @param _data Initialization data. We expect the following data, ABI-encoded:
     *              - address _owner: Address of the owner of this contract.
     *              - bytes32 _organizationID: Organization ID for this contract.
     *              - bool _allowManagedProposals: Whether or not to allow upgrade proposals from
     *                the ManagedService contract.
     *
     * @return Empty bytes.
     */
    function initialize(bytes memory _data) external initializer returns (bytes memory) {
        (address _owner, bytes32 _organizationID, bool _allowManagedProposals) = abi.decode(
            _data,
            (address, bytes32, bool)
        );

        organizationID = _organizationID;
        allowManagedProposals = _allowManagedProposals;

        __ReentrancyGuard_init();
        __Ownable_init();
        _transferOwnership(_owner);

        return "";
    }

    /**
     * @notice Propose a new deployment. No action can be taken on the deployment until it is
       approved via the `approve` function. Only callable by the owner of this contract, a proposer
       that has been approved by the owner, or the ManagedService contract, if
       `allowManagedProposals` is true. These permissions prevent spam.
     *
     * @param _actionRoot Root of the Merkle tree containing the actions for the deployment.
     * This may be `bytes32(0)` if there are no actions in the deployment.
     * @param _targetRoot Root of the Merkle tree containing the targets for the deployment.
     * This may be `bytes32(0)` if there are no targets in the deployment.
     * @param _numNonProxyContracts Number of non-proxy contracts in the deployment.
     * @param _numActions Number of actions in the deployment.
     * @param _numTargets Number of targets in the deployment.
     * @param _configUri  URI pointing to the config file for the deployment.
     * @param _remoteExecution Whether or not to allow remote execution of the deployment.
     */
    function propose(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numActions,
        uint256 _numTargets,
        uint256 _numNonProxyContracts,
        string memory _configUri,
        bool _remoteExecution
    ) public {
        if (!isProposer(_msgSender())) {
            revert CallerIsNotProposer();
        }

        // Compute the deployment ID.
        bytes32 deploymentId = keccak256(
            abi.encode(
                _actionRoot,
                _targetRoot,
                _numActions,
                _numTargets,
                _numNonProxyContracts,
                _configUri
            )
        );

        DeploymentState storage deployment = _deployments[deploymentId];

        DeploymentStatus status = deployment.status;
        if (
            status != DeploymentStatus.EMPTY &&
            status != DeploymentStatus.COMPLETED &&
            status != DeploymentStatus.CANCELLED &&
            status != DeploymentStatus.FAILED
        ) {
            revert DeploymentStateIsNotProposable();
        }

        deployment.status = DeploymentStatus.PROPOSED;
        deployment.actionRoot = _actionRoot;
        deployment.targetRoot = _targetRoot;
        deployment.numNonProxyContracts = _numNonProxyContracts;
        deployment.actions = new bool[](_numActions);
        deployment.targets = _numTargets;
        deployment.remoteExecution = _remoteExecution;

        emit ChugSplashDeploymentProposed(
            deploymentId,
            _actionRoot,
            _targetRoot,
            _numActions,
            _numTargets,
            _numNonProxyContracts,
            _configUri,
            _remoteExecution,
            _msgSender()
        );
        registry.announceWithData("ChugSplashDeploymentProposed", abi.encodePacked(_msgSender()));
    }

    /**
     * @notice Wrapper on the propose function which allows for a gasless proposal where the cost of
     *         the using proposal is added to the protocol debt. This allows us to provide gasless
     *         proposals using meta transactions while collecting the cost from the user after
     *         execution completes.
     */
    function gaslesslyPropose(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numActions,
        uint256 _numTargets,
        uint256 _numNonProxyContracts,
        string memory _configUri,
        bool _remoteExecution
    ) external {
        uint256 initialGasLeft = gasleft();

        propose(
            _actionRoot,
            _targetRoot,
            _numActions,
            _numTargets,
            _numNonProxyContracts,
            _configUri,
            _remoteExecution
        );

        // Get the gas price
        uint256 gasPrice = gasPriceCalculator.getGasPrice();
        // Estimate the cost of the call data
        uint256 calldataGasUsed = _msgData().length * 16;
        // Calculate the gas used for the entire transaction, and add a buffer of 50k.
        uint256 estGasUsed = 100_000 + calldataGasUsed + initialGasLeft - gasleft();
        uint256 proposalCost = gasPrice * estGasUsed;

        // Add the cost of the proposal to the protocol debt
        totalProtocolDebt += proposalCost;
    }

    /**
     * @notice Allows the owner to approve a deployment to be executed. If remote execution is
       enabled, there must be at least `ownerBondAmount` deposited in this contract before the
       deployment can be approved. The deployment must be proposed before it can be approved.
     *
     * @param _deploymentId ID of the deployment to approve
     */
    function approve(bytes32 _deploymentId) external onlyOwner {
        DeploymentState storage deployment = _deployments[_deploymentId];

        if (
            deployment.remoteExecution &&
            address(this).balance > totalDebt() &&
            address(this).balance - totalDebt() < ownerBondAmount
        ) {
            revert InsufficientOwnerBond();
        }

        if (deployment.status != DeploymentStatus.PROPOSED) {
            revert DeploymentIsNotProposed();
        }

        if (activeDeploymentId != bytes32(0)) {
            revert AnotherDeploymentInProgress();
        }

        activeDeploymentId = _deploymentId;
        deployment.status = DeploymentStatus.APPROVED;

        emit ChugSplashDeploymentApproved(_deploymentId);
        registry.announce("ChugSplashDeploymentApproved");
    }

    /**
     * @notice Helper function that executes an entire upgrade in a single transaction. This allows
       the proxies in smaller upgrades to have zero downtime. This must occur after all of the
       `DEPLOY_CONTRACT` actions have been executed.

     * @param _targets Array of ChugSplashTarget structs containing the targets for the deployment.
     * @param _targetProofs Array of Merkle proofs for the targets.
     * @param _actions Array of ChugSplashAction structs containing the actions for the deployment.
     * @param _actionIndexes Array of indexes into the actions array for each target.
     * @param _actionProofs Array of Merkle proofs for the actions.
     */
    function executeEntireUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _targetProofs,
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _actionProofs
    ) external {
        initiateUpgrade(_targets, _targetProofs);

        // Execute the `SET_STORAGE` actions if there are any.
        if (_actions.length > 0) {
            executeActions(_actions, _actionIndexes, _actionProofs);
        }

        finalizeUpgrade(_targets, _targetProofs);
    }

    /**
     * @notice **WARNING**: Cancellation is a potentially dangerous action and should not be
     *         executed unless in an emergency.
     *
     *         Allows the owner to cancel an active deployment that was approved. If an executor has
               not claimed the deployment, the owner is simply allowed to withdraw their bond via a
               subsequent call to `withdrawOwnerETH`. Otherwise, cancelling a deployment will cause
               the owner to forfeit their bond to the executor. This is necessary to prevent owners
               from trolling the remote executor by immediately cancelling and withdrawing funds.
     */
    function cancelActiveChugSplashDeployment() external onlyOwner {
        if (activeDeploymentId == bytes32(0)) {
            revert NoActiveDeployment();
        }

        DeploymentState storage deployment = _deployments[activeDeploymentId];

        if (
            deployment.remoteExecution &&
            deployment.timeClaimed + executionLockTime >= block.timestamp
        ) {
            // Give the owner's bond to the executor if the deployment is cancelled within the
            // `executionLockTime` window.
            executorDebt[_msgSender()] += ownerBondAmount;
            totalExecutorDebt += ownerBondAmount;
        }

        bytes32 cancelledDeploymentId = activeDeploymentId;
        activeDeploymentId = bytes32(0);
        deployment.status = DeploymentStatus.CANCELLED;

        emit ChugSplashDeploymentCancelled(
            cancelledDeploymentId,
            _msgSender(),
            deployment.actionsExecuted
        );
        registry.announce("ChugSplashDeploymentCancelled");
    }

    /**
     * @notice Allows a remote executor to claim the sole right to execute a deployment over a
               period of `executionLockTime`. Only the first executor to post a bond gains this
               right. Executors must finish executing the deployment within `executionLockTime` or
               else another executor may claim the deployment.
     */
    function claimDeployment() external onlyExecutor {
        if (activeDeploymentId == bytes32(0)) {
            revert NoActiveDeployment();
        }

        DeploymentState storage deployment = _deployments[activeDeploymentId];

        if (!deployment.remoteExecution) {
            revert RemoteExecutionDisabled();
        }

        if (block.timestamp <= deployment.timeClaimed + executionLockTime) {
            revert DeploymentAlreadyClaimed();
        }

        deployment.timeClaimed = block.timestamp;
        deployment.selectedExecutor = _msgSender();

        emit ChugSplashDeploymentClaimed(activeDeploymentId, _msgSender());
        registry.announce("ChugSplashDeploymentClaimed");
    }

    /**
     * @notice Allows an executor to claim its ETH payment that was earned by completing a
       deployment. Executors may only withdraw an amount less than or equal to the amount of ETH
       owed to them by this contract. We allow the executor to withdraw less than the amount owed to
       them because it's possible that the executor's debt exceeds the amount of ETH stored in this
       contract. This situation can occur when the executor completes an underfunded deployment.

     * @param _amount Amount of ETH to withdraw.
     */
    function claimExecutorPayment(uint256 _amount) external onlyExecutor {
        if (_amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }
        if (executorDebt[_msgSender()] < _amount) {
            revert InsufficientExecutorDebt();
        }
        if (_amount + totalProtocolDebt > address(this).balance) {
            revert InsufficientFunds();
        }

        executorDebt[_msgSender()] -= _amount;
        totalExecutorDebt -= _amount;

        emit ExecutorPaymentClaimed(_msgSender(), _amount, executorDebt[_msgSender()]);

        (bool paidExecutor, ) = payable(_msgSender()).call{ value: _amount }(new bytes(0));
        if (!paidExecutor) {
            revert WithdrawalFailed();
        }

        (bool paidProtocol, ) = payable(address(managedService)).call{ value: totalProtocolDebt }(
            new bytes(0)
        );
        if (!paidProtocol) {
            revert WithdrawalFailed();
        }

        registry.announce("ExecutorPaymentClaimed");
    }

    /**
     * @notice Transfers ownership of a proxy away from this contract to a specified address. Only
       callable by the owner. Note that this function allows the owner to send ownership of their
       proxy to address(0), which would make their proxy non-upgradeable.
     *
     * @param _proxy  Address of the proxy to transfer ownership of.
     * @param _contractKindHash  Hash of the contract kind, which represents the proxy type.
     * @param _newOwner  Address of the owner to receive ownership of the proxy.
     */
    function exportProxy(
        address payable _proxy,
        bytes32 _contractKindHash,
        address _newOwner
    ) external onlyOwner {
        if (_proxy.code.length == 0) {
            revert ContractDoesNotExist();
        }

        if (activeDeploymentId != bytes32(0)) {
            revert AnotherDeploymentInProgress();
        }

        // Get the adapter that corresponds to this contract type.
        address adapter = registry.adapters(_contractKindHash);
        if (adapter == address(0)) {
            revert InvalidContractKind();
        }

        emit ProxyExported(_proxy, _contractKindHash, _newOwner);

        // Delegatecall the adapter to change ownership of the proxy.
        // slither-disable-next-line controlled-delegatecall
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.changeProxyAdmin, (_proxy, _newOwner))
        );
        if (!success) {
            revert ProxyExportFailed();
        }

        registry.announce("ProxyExported");
    }

    /**
     * @notice Allows the owner to withdraw all funds in this contract minus the debt
     *         owed to the executor and protocol. Cannot be called when there is an active
               deployment, as this would rug the remote executor.
     */
    function withdrawOwnerETH() external onlyOwner {
        if (activeDeploymentId != bytes32(0)) {
            revert AnotherDeploymentInProgress();
        }

        uint256 amount = address(this).balance - totalDebt();

        emit OwnerWithdrewETH(_msgSender(), amount);

        (bool success, ) = payable(_msgSender()).call{ value: amount }(new bytes(0));
        if (!success) {
            revert WithdrawalFailed();
        }

        registry.announce("OwnerWithdrewETH");
    }

    /**
     * @notice Allows the owner of this contract to add or remove a proposer.
     *
     * @param _proposer Address of the proposer to add or remove.
     * @param _isProposer Whether or not the proposer should be added or removed.
     */
    function setProposer(address _proposer, bool _isProposer) external onlyOwner {
        proposers[_proposer] = _isProposer;

        emit ProposerSet(_proposer, _isProposer, _msgSender());
        registry.announceWithData("ProposerSet", abi.encodePacked(_isProposer));
    }

    /**
     * @notice Allows the owner to toggle whether or not proposals via the ManagedService contract
       is allowed.
     */
    function toggleAllowManagedProposals() external onlyOwner {
        allowManagedProposals = !allowManagedProposals;

        emit ToggledManagedProposals(allowManagedProposals, _msgSender());
        registry.announceWithData(
            "ToggledManagedProposals",
            abi.encodePacked(allowManagedProposals)
        );
    }

    /**
     * @notice Gets the DeploymentState struct for a given deployment ID. Note that we explicitly
     *         define this function because the getter function auto-generated by Solidity doesn't
               return
     *         array members of structs: https://github.com/ethereum/solidity/issues/12792. Without
     *         this function, we wouldn't be able to retrieve the full `DeploymentState.actions`
               array.
     *
     * @param _deploymentId Deployment ID.
     *
     * @return DeploymentState struct.
     */
    function deployments(bytes32 _deploymentId) external view returns (DeploymentState memory) {
        return _deployments[_deploymentId];
    }

    /**
     * @inheritdoc IChugSplashManager
     */
    function isExecuting() external view returns (bool) {
        return activeDeploymentId != bytes32(0);
    }

    /**
     * @notice Deploys non-proxy contracts and sets proxy state variables. If the deployment does
       not contain any proxies, it will be completed after all of the non-proxy contracts have been
       deployed in this function.
     *
     * @param _actions Array of ChugSplashAction structs containing the actions for the deployment.
     * @param _actionIndexes Array of action indexes.
     * @param _proofs Array of Merkle proofs for the actions.
     */
    function executeActions(
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        DeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        uint256 numActions = _actions.length;

        // Prevents the executor from repeatedly sending an empty array of `_actions`, which would
        // cause the executor to be paid for doing nothing.
        if (numActions == 0) {
            revert EmptyActionsArray();
        }

        ChugSplashAction memory action;
        uint256 actionIndex;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            action = _actions[i];
            actionIndex = _actionIndexes[i];
            proof = _proofs[i];

            if (deployment.actions[actionIndex]) {
                revert ActionAlreadyExecuted();
            }

            if (
                !MerkleTree.verify(
                    deployment.actionRoot,
                    keccak256(
                        abi.encode(
                            action.referenceName,
                            action.addr,
                            action.actionType,
                            action.contractKindHash,
                            action.data
                        )
                    ),
                    actionIndex,
                    proof,
                    deployment.actions.length
                )
            ) {
                revert InvalidMerkleProof();
            }

            // Mark the action as executed and update the total number of executed actions.
            deployment.actionsExecuted++;
            deployment.actions[actionIndex] = true;

            if (action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                _attemptContractDeployment(deployment, action, actionIndex);

                if (
                    deployment.actionsExecuted == deployment.actions.length &&
                    deployment.targets == 0 &&
                    deployment.status != DeploymentStatus.FAILED
                ) {
                    _completeDeployment(deployment);
                }
            } else if (action.actionType == ChugSplashActionType.SET_STORAGE) {
                _setProxyStorage(deployment, action, actionIndex);
            } else {
                revert InvalidActionType();
            }
        }

        _payExecutorAndProtocol(initialGasLeft, deployment.remoteExecution);
    }

    /**
     * @notice Initiate the proxies in an upgrade. This must be called after the contracts are
       deployment is approved, and before the rest of the execution process occurs. In this
       function, all of the proxies in the deployment are disabled by setting their implementations
       to a contract that can only be called by the team's ChugSplashManagerProxy. This must occur
       in a single transaction to make the process atomic, which means the proxies are upgraded as a
       single unit.

     * @param _targets Array of ChugSplashTarget structs containing the targets for the deployment.
     * @param _proofs Array of Merkle proofs for the targets.
     */
    function initiateUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        DeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        if (deployment.actionsExecuted != deployment.numNonProxyContracts) {
            revert InitiatedUpgradeTooEarly();
        }

        // Ensures that the deployment status isn't `FAILED`.
        if (deployment.status != DeploymentStatus.APPROVED) {
            revert DeploymentIsNotApproved();
        }

        uint256 numTargets = _targets.length;
        if (numTargets != deployment.targets) {
            revert IncorrectNumberOfTargets();
        }

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            if (target.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH) {
                revert OnlyProxiesAllowed();
            }

            if (
                !MerkleTree.verify(
                    deployment.targetRoot,
                    keccak256(
                        abi.encode(
                            target.projectName,
                            target.referenceName,
                            target.addr,
                            target.implementation,
                            target.contractKindHash
                        )
                    ),
                    i,
                    proof,
                    deployment.targets
                )
            ) {
                revert InvalidMerkleProof();
            }

            if (target.contractKindHash == bytes32(0) && target.addr.code.length == 0) {
                bytes32 salt = keccak256(abi.encode(target.projectName, target.referenceName));
                Proxy created = new Proxy{ salt: salt }(address(this));

                // Could happen if insufficient gas is supplied to this transaction, should not
                // happen otherwise. If there's a situation in which this could happen other than a
                // standard OOG, then this would halt the entire execution process.
                if (address(created) != target.addr) {
                    revert ProxyDeploymentFailed();
                }

                emit DefaultProxyDeployed(
                    salt,
                    target.addr,
                    activeDeploymentId,
                    target.projectName,
                    target.referenceName
                );
                registry.announceWithData("DefaultProxyDeployed", abi.encodePacked(target.addr));
            }

            address adapter = registry.adapters(target.contractKindHash);
            if (adapter == address(0)) {
                revert InvalidContractKind();
            }

            // Set the proxy's implementation to be a ProxyUpdater. Updaters ensure that only the
            // ChugSplashManager can interact with a proxy that is in the process of being updated.
            // Note that we use the Updater contract to provide a generic interface for updating a
            // variety of proxy types. Note no adapter is necessary for non-proxied contracts as
            // they are not upgradable and cannot have state.
            // slither-disable-next-line controlled-delegatecall
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.initiateUpgrade, (target.addr))
            );
            if (!success) {
                revert FailedToInitiateUpgrade();
            }
        }

        // Mark the deployment as initiated.
        deployment.status = DeploymentStatus.PROXIES_INITIATED;

        emit ProxiesInitiated(activeDeploymentId, _msgSender());
        registry.announce("ProxiesInitiated");

        _payExecutorAndProtocol(initialGasLeft, deployment.remoteExecution);
    }

    /**
     * @notice Finalizes the upgrade by upgrading all proxies to their new implementations. This
     *         occurs in a single transaction to ensure that the upgrade is atomic.
     *
     * @param _targets Array of ChugSplashTarget structs containing the targets for the deployment.
     * @param _proofs Array of Merkle proofs for the targets.
     */
    function finalizeUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        DeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        if (activeDeploymentId == bytes32(0)) {
            revert NoActiveDeployment();
        }

        if (deployment.actionsExecuted != deployment.actions.length) {
            revert FinalizedUpgradeTooEarly();
        }

        uint256 numTargets = _targets.length;
        if (numTargets != deployment.targets) {
            revert IncorrectNumberOfTargets();
        }

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            if (target.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH) {
                revert OnlyProxiesAllowed();
            }

            if (
                !MerkleTree.verify(
                    deployment.targetRoot,
                    keccak256(
                        abi.encode(
                            target.projectName,
                            target.referenceName,
                            target.addr,
                            target.implementation,
                            target.contractKindHash
                        )
                    ),
                    i,
                    proof,
                    deployment.targets
                )
            ) {
                revert InvalidMerkleProof();
            }

            // Get the proxy type and adapter for this reference name.
            address adapter = registry.adapters(target.contractKindHash);
            if (adapter == address(0)) {
                revert InvalidContractKind();
            }

            // Upgrade the proxy's implementation contract.
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.finalizeUpgrade, (target.addr, target.implementation))
            );
            if (!success) {
                revert FailedToFinalizeUpgrade();
            }
        }

        _completeDeployment(deployment);

        _payExecutorAndProtocol(initialGasLeft, deployment.remoteExecution);
    }

    /**
     * @notice Determines if a given address is allowed to propose deployments.
     *
     * @param _addr Address to check.
     *
     * @return True if the address is allowed to propose deployments, otherwise false.
     */
    function isProposer(address _addr) public view returns (bool) {
        return
            (allowManagedProposals && managedService.hasRole(MANAGED_PROPOSER_ROLE, _addr)) ||
            proposers[_addr] ||
            _addr == owner();
    }

    /**
     * @notice Returns the total debt owed to executors and the protocol creators.
     *
     * @return Total debt owed to executors and the protocol creators.
     */
    function totalDebt() public view returns (uint256) {
        return totalExecutorDebt + totalProtocolDebt;
    }

    /**
     * @notice Queries the selected executor for a given project/deployment. This will return
       address(0) if the deployment is being self-executed by the owner.
     *
     * @param _deploymentId ID of the deployment to query.
     *
     * @return Address of the selected executor.
     */
    function getSelectedExecutor(bytes32 _deploymentId) public view returns (address) {
        DeploymentState storage deployment = _deployments[_deploymentId];
        return deployment.selectedExecutor;
    }

    /**
     * @notice Modifies a storage slot value within a proxy contract.
     *
     * @param _deployment The current deployment state struct.
     * @param _action The `SET_STORAGE` action to execute.
     * @param _actionIndex The index of the action.
     */
    function _setProxyStorage(
        DeploymentState memory _deployment,
        ChugSplashAction memory _action,
        uint256 _actionIndex
    ) internal {
        if (_deployment.status != DeploymentStatus.PROXIES_INITIATED) {
            revert ProxiesAreNotInitiated();
        }

        // Get the adapter for this reference name.
        address adapter = registry.adapters(_action.contractKindHash);

        if (_action.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH) {
            revert OnlyProxiesAllowed();
        }

        (bytes32 key, uint8 offset, bytes memory val) = abi.decode(
            _action.data,
            (bytes32, uint8, bytes)
        );
        // Delegatecall the adapter to call `setStorage` on the proxy.
        // slither-disable-next-line controlled-delegatecall
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.setStorage, (_action.addr, key, offset, val))
        );
        if (!success) {
            revert SetStorageFailed();
        }

        emit SetProxyStorage(activeDeploymentId, _action.addr, _msgSender(), _actionIndex);
        registry.announceWithData("SetProxyStorage", abi.encodePacked(_action.addr));
    }

    /**
     * @notice Attempts to deploy a non-proxy contract. The deployment will be skipped if a contract
     * already exists at the Create3 address. The entire deployment will be cancelled if the
       contract fails to be deployed, which should only occur if its constructor reverts.
     *
     * @param _deployment The current deployment state struct. The data location is "storage"
       because we
     * may modify one of the struct's fields.
     * @param _action The `DEPLOY_CONTRACT` action to execute.
     * @param _actionIndex The index of the action.
     */
    function _attemptContractDeployment(
        DeploymentState storage _deployment,
        ChugSplashAction memory _action,
        uint256 _actionIndex
    ) internal {
        if (_deployment.status != DeploymentStatus.APPROVED) {
            revert DeploymentIsNotApproved();
        }

        (bytes32 salt, bytes memory creationCodeWithConstructorArgs) = abi.decode(
            _action.data,
            (bytes32, bytes)
        );

        string memory referenceName = _action.referenceName;

        // Get the expected address of the contract. We delegatecall the Create3 contract because
        // the deployer of the contract is the ChugSplashManager.
        (bool success, bytes memory expectedAddressBytes) = create3.delegatecall(
            abi.encodeCall(ICreate3.getAddress, (salt))
        );

        if (!success) {
            revert FailedToGetAddress();
        }

        address expectedAddress = abi.decode(expectedAddressBytes, (address));

        // Check if the contract has already been deployed.
        if (expectedAddress.code.length > 0) {
            // Skip deploying the contract if it already exists. Execution would halt if we attempt
            // to deploy a contract that has already been deployed at the same address.
            emit ContractDeploymentSkipped(
                referenceName,
                expectedAddress,
                activeDeploymentId,
                referenceName,
                _actionIndex
            );
            registry.announce("ContractDeploymentSkipped");
        } else {
            // We delegatecall the Create3 contract so that the ChugSplashManager address is used in
            // the address calculation of the deployed contract.
            (bool deploySuccess, bytes memory actualAddressBytes) = create3.delegatecall(
                abi.encodeCall(ICreate3.deploy, (salt, creationCodeWithConstructorArgs, 0))
            );

            if (!deploySuccess) {
                revert FailedToDeployContract();
            }

            address actualAddress = abi.decode(actualAddressBytes, (address));

            if (expectedAddress == actualAddress) {
                // Contract was deployed successfully.
                emit ContractDeployed(
                    referenceName,
                    actualAddress,
                    activeDeploymentId,
                    referenceName,
                    _actionIndex,
                    keccak256(creationCodeWithConstructorArgs)
                );
                registry.announce("ContractDeployed");
            } else {
                // Contract deployment failed. Could happen if insufficient gas is supplied to this
                // transaction or if the creation bytecode has logic that causes the call to fail
                // (e.g. a constructor that reverts).

                // Give the owner's bond to the executor.
                executorDebt[_msgSender()] += ownerBondAmount;
                totalExecutorDebt += ownerBondAmount;

                emit DeploymentFailed(
                    referenceName,
                    expectedAddress,
                    activeDeploymentId,
                    referenceName,
                    _actionIndex
                );
                registry.announceWithData("DeploymentFailed", abi.encodePacked(activeDeploymentId));

                activeDeploymentId = bytes32(0);
                _deployment.status = DeploymentStatus.FAILED;
            }
        }
    }

    /**
     * @notice Mark the deployment as completed and reset the active deployment ID.

     * @param _deployment The current deployment state struct. The data location is "s  rage"
       because we modify the struct.
     */
    function _completeDeployment(DeploymentState storage _deployment) internal {
        _deployment.status = DeploymentStatus.COMPLETED;

        emit ChugSplashDeploymentCompleted(activeDeploymentId, _msgSender());
        registry.announce("ChugSplashDeploymentCompleted");

        activeDeploymentId = bytes32(0);
    }

    /**
     * @notice Pay the executor and protocol creator based on the transaction's gas price and the
       gas used. Note that no payment occurs for self-executed deployments.

        * @param _initialGasLeft Gas left at the beginning of this transaction.
        * @param _remoteExecution True if the deployment is being executed remotely, otherwise
          false.
     */
    function _payExecutorAndProtocol(uint256 _initialGasLeft, bool _remoteExecution) internal {
        if (!_remoteExecution) {
            return;
        }

        uint256 gasPrice = gasPriceCalculator.getGasPrice();

        // Estimate the gas used by the calldata. Note that, in general, 16 gas is used per non-zero
        // byte of calldata and 4 gas is used per zero-byte of calldata. We use 16 for simplicity
        // and because we must overestimate the executor's payment to ensure that it doesn't lose
        // money.
        uint256 calldataGasUsed = _msgData().length * 16;

        // Estimate the total gas used in this transaction. We calculate this by adding the gas used
        // by the calldata with the net estimated gas used by this function so far (i.e.
        // `_initialGasLeft - gasleft()`). We add 100k to account for the intrinsic gas cost (21k)
        // and the operations that occur after we assign a value to `estGasUsed`. Note that it's
        // crucial for this estimate to be greater than the actual gas used by this transaction so
        // that the executor doesn't lose money`.
        uint256 estGasUsed = 100_000 + calldataGasUsed + _initialGasLeft - gasleft();

        uint256 executorPayment = (gasPrice * estGasUsed * (100 + executorPaymentPercentage)) / 100;
        uint256 protocolPayment = (gasPrice * estGasUsed * (protocolPaymentPercentage)) / 100;

        // Add the executor's payment to the executor debt.
        totalExecutorDebt += executorPayment;
        executorDebt[_msgSender()] += executorPayment;

        // Add the protocol's payment to the protocol debt.
        totalProtocolDebt += protocolPayment;
    }

    /**
     * @notice If the deployment is being executed remotely, this function will check that the
     * caller is the selected executor. If the deployment is being executed locally, this function
     * will check that the caller is the owner. Throws an error otherwise.

       @param _remoteExecution True if the deployment is being executed remotely, otherwise false.

     */
    function _assertCallerIsOwnerOrSelectedExecutor(bool _remoteExecution) internal view {
        if (_remoteExecution == true && getSelectedExecutor(activeDeploymentId) != _msgSender()) {
            revert CallerIsNotSelectedExecutor();
        } else if (_remoteExecution == false && owner() != _msgSender()) {
            revert CallerIsNotOwner();
        }
    }

    /**
     * @notice Use the ERC2771Recipient implementation to get the sender of the current call.
     */
    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        sender = ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Use the ERC2771Recipient implementation to get the data of the current call.
     */
    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata)
    {
        return ERC2771ContextUpgradeable._msgData();
    }
}
