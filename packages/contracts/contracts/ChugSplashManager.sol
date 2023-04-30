// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    ChugSplashDeploymentState,
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
import { ICreate2 } from "./interfaces/ICreate2.sol";
import { Semver, Version } from "./Semver.sol";
import { IGasPriceCalculator } from "./interfaces/IGasPriceCalculator.sol";

/**
 * @title ChugSplashManager
 */

contract ChugSplashManager is
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    Semver,
    IChugSplashManager
{
    bytes32 internal constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    bytes32 internal constant PROTOCOL_PAYMENT_RECIPIENT_ROLE =
        keccak256("PROTOCOL_PAYMENT_RECIPIENT_ROLE");

    bytes32 internal constant MANAGED_PROPOSER_ROLE = keccak256("MANAGED_PROPOSER_ROLE");

    bytes32 internal constant NO_PROXY_CONTRACT_KIND_HASH = keccak256("no-proxy");

    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    ICreate2 public immutable create2;

    IGasPriceCalculator public immutable gasPriceCalculator;

    IAccessControl public immutable managedService;

    /**
     * @notice Amount that must be deposited in this contract in order to execute a deployment. The
     *         project owner can withdraw this amount whenever a deployment is not active. This bond
     *         will be forfeited if the project owner cancels a deployment that is in progress, which is
     *         necessary to prevent owners from trolling the executor by immediately cancelling and
     *         withdrawing funds.
     */
    uint256 public immutable ownerBondAmount;

    /**
     * @notice Amount of time for an executor to finish executing a deployment once they have claimed
     *         it. If the owner cancels an active deployment within this time period, their bond is
     *         forfeited to the executor. This prevents users from trolling executors by immediately
     *         cancelling active deployments.
     */
    uint256 public immutable executionLockTime;

    /**
     * @notice Amount that the executor is paid, denominated as a percentage of the cost of
     *         execution. For example: if a deployment costs 1 gwei to execute and the
     *         executorPaymentPercentage is 10, then the executor will profit 0.1 gwei.
     */
    uint256 public immutable executorPaymentPercentage;

    uint256 public immutable protocolPaymentPercentage;

    /**
     * @notice Mapping of executor addresses to the ETH amount stored in this contract that is
     *         owed to them.
     */
    mapping(address => uint256) public executorDebt;

    /**
     * @notice Maps an address to a boolean indicating if the address is allowed to propose deployments.
     */
    mapping(address => bool) public proposers;

    /**
     * @notice Mapping of deployment IDs to deployment state.
     */
    mapping(bytes32 => ChugSplashDeploymentState) internal _deployments;

    /**
     * @notice ID of the organization this contract is managing.
     */
    bytes32 public organizationID;

    /**
     * @notice ID of the currently active deployment.
     */
    bytes32 public activeDeploymentId;

    /**
     * @notice ETH amount that is owed to the executor.
     */
    uint256 public totalExecutorDebt;

    uint256 public totalProtocolDebt;

    bool public allowManagedProposals;

    /**
     * @notice Emitted when a ChugSplash deployment is proposed.
     *
     * @param deploymentId   ID of the deployment being proposed.
     * @param actionRoot Root of the proposed deployment's merkle tree.
     * @param numActions Number of steps in the proposed deployment.
     * @param configUri  URI of the config file that can be used to re-generate the deployment.
     */
    event ChugSplashDeploymentProposed(
        bytes32 indexed deploymentId,
        bytes32 actionRoot,
        bytes32 targetRoot,
        uint256 numActions,
        uint256 numTargets,
        string configUri,
        bool remoteExecution,
        address proposer
    );

    /**
     * @notice Emitted when a ChugSplash deployment is approved.
     *
     * @param deploymentId ID of the deployment being approved.
     */
    event ChugSplashDeploymentApproved(bytes32 indexed deploymentId);

    /**
     * @notice Emitted when a ChugSplash action is executed.
     *
     * @param deploymentId    Unique ID for the deployment.
     * @param proxy       Address of the proxy on which the event was executed.
     * @param executor    Address of the executor that executed the action.
     * @param actionIndex Index within the deployment hash of the action that was executed.
     */
    event ChugSplashActionExecuted(
        bytes32 indexed deploymentId,
        address indexed proxy,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a ChugSplash deployment is initiated.
     *
     * @param deploymentId        Unique ID for the deployment.
     * @param executor        Address of the executor that initiated the deployment.
     */
    event ChugSplashDeploymentInitiated(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when a ChugSplash deployment is completed.
     *
     * @param deploymentId        Unique ID for the deployment.
     * @param executor        Address of the executor that completed the deployment.
     * @param actionsExecuted Total number of completed actions.
     */
    event ChugSplashDeploymentCompleted(
        bytes32 indexed deploymentId,
        address indexed executor,
        uint256 actionsExecuted
    );

    /**
     * @notice Emitted when an active ChugSplash deployment is cancelled.
     *
     * @param deploymentId        Deployment ID that was cancelled.
     * @param owner           Owner of the ChugSplashManager.
     * @param actionsExecuted Total number of completed actions before cancellation.
     */
    event ChugSplashDeploymentCancelled(
        bytes32 indexed deploymentId,
        address indexed owner,
        uint256 actionsExecuted
    );

    /**
     * @notice Emitted when ownership of a proxy is transferred from the ProxyAdmin to the project
     *         owner.
     *
     * @param proxy            Address of the proxy that is the subject of the ownership transfer.
     * @param contractKindHash The contract kind. I.e transparent, UUPS, or no proxy.
     * @param newOwner         Address of the project owner that is receiving ownership of the
     *                         proxy.
     */
    event ProxyOwnershipTransferred(
        address indexed proxy,
        bytes32 indexed contractKindHash,
        address newOwner
    );

    /**
     * @notice Emitted when a deployment is claimed by an executor.
     *
     * @param deploymentId ID of the deployment that was claimed.
     * @param executor Address of the executor that claimed the deployment ID for the project.
     */
    event ChugSplashDeploymentClaimed(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when an executor claims a payment.
     *
     * @param executor The executor being paid.
     */
    event ExecutorPaymentClaimed(address indexed executor, uint256 withdrawn, uint256 remaining);

    event ProtocolPaymentClaimed(address indexed recipient, uint256 amount);

    /**
     * @notice Emitted when the owner withdraws ETH from this contract.
     *
     * @param owner  Address that initiated the withdrawal.
     * @param amount ETH amount withdrawn.
     */
    event OwnerWithdrewETH(address indexed owner, uint256 amount);

    /**
     * @notice Emitted when the owner of this contract adds or removes a new proposer.
     *
     * @param proposer Address of the proposer that was added.
     * @param proposer Address of the owner.
     */
    event ProposerSet(address indexed proposer, bool indexed isProposer, address indexed owner);

    event ToggledManagedProposals(bool isManaged, address indexed owner);

    /**
     * @notice Emitted when ETH is deposited in this contract
     */
    event ETHDeposited(address indexed from, uint256 indexed amount);

    /**
     * @notice Emitted when a default proxy is deployed by this contract.
     *
     * @param proxy             Address of the deployed proxy.
     * @param deploymentId          ID of the deployment in which the proxy was deployed.
     * @param referenceName     String reference name.
     */
    event DefaultProxyDeployed(
        bytes32 indexed salt,
        address indexed proxy,
        bytes32 indexed deploymentId,
        string projectName,
        string referenceName
    );

    /**
     * @notice Emitted when a contract is deployed.
     *
     * @param referenceNameHash Hash of the reference name.
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param referenceName     String reference name.
     */
    event ContractDeployed(
        string indexed referenceNameHash,
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        string referenceName
    );

    event ContractDeploymentSkipped(
        string indexed referenceNameHash,
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        string referenceName
    );

    /**
     * @notice Modifier that restricts access to the executor.
     */
    modifier onlyExecutor() {
        require(
            managedService.hasRole(EXECUTOR_ROLE, msg.sender),
            "ChugSplashManager: caller is not executor"
        );
        _;
    }

    /**
     * @param _registry                  Address of the ChugSplashRegistry.
     * @param _executionLockTime         Amount of time for an executor to completely execute a
     *                                   deployment after claiming it.
     * @param _ownerBondAmount           Amount that must be deposited in this contract in order to
     *                                   execute a deployment.
     * @param _executorPaymentPercentage Amount that an executor will earn from completing a deployment,
     *                                   denominated as a percentage.
     */
    constructor(
        ChugSplashRegistry _registry,
        ICreate2 _create2,
        IGasPriceCalculator _gasPriceCalculator,
        IAccessControl _managedService,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount,
        uint256 _executorPaymentPercentage,
        uint256 _protocolPaymentPercentage,
        Version memory _version
    ) Semver(_version.major, _version.minor, _version.patch) {
        registry = _registry;
        create2 = _create2;
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
        emit ETHDeposited(msg.sender, msg.value);
        registry.announce("ETHDeposited");
    }

    /**
     * @param _data Arbitrary initialization data, allows for future manager versions to use the
     *               same interface.
     *              In this version, we expect the following data:
     *              - address _owner: Address of the owner of this contract.
     *              - bytes32 _organizationID: ID of the organization this contract is managing.
     *              - bool _allowManagedProposals: Whether or not to allow upgrade proposals from
     *                the ChugSplash managed service.
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
     * @notice Propose a new ChugSplash deployment to be approved. Only callable by the owner of this
     *         contract or a proposer. These permissions are required to prevent spam.
     *
     * @param _actionRoot Root of the deployment's merkle tree.
     * @param _numActions Number of elements in the deployment's tree.
     * @param _configUri  URI pointing to the config file for the deployment.
     */
    function proposeChugSplashDeployment(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numActions,
        uint256 _numTargets,
        string memory _configUri,
        bool _remoteExecution
    ) external {
        require(isProposer(msg.sender), "ChugSplashManager: caller must be proposer");

        // Compute the deployment ID.
        bytes32 deploymentId = keccak256(
            abi.encode(_actionRoot, _targetRoot, _numActions, _numTargets, _configUri)
        );

        ChugSplashDeploymentState storage deployment = _deployments[deploymentId];

        DeploymentStatus status = deployment.status;
        require(
            status == DeploymentStatus.EMPTY ||
                status == DeploymentStatus.COMPLETED ||
                status == DeploymentStatus.CANCELLED,
            "ChugSplashManager: deployment cannot be proposed"
        );

        deployment.status = DeploymentStatus.PROPOSED;
        deployment.actionRoot = _actionRoot;
        deployment.targetRoot = _targetRoot;
        deployment.actions = new bool[](_numActions);
        deployment.numTargets = _numTargets;
        deployment.remoteExecution = _remoteExecution;

        emit ChugSplashDeploymentProposed(
            deploymentId,
            _actionRoot,
            _targetRoot,
            _numActions,
            _numTargets,
            _configUri,
            _remoteExecution,
            msg.sender
        );
        registry.announceWithData("ChugSplashDeploymentProposed", abi.encodePacked(msg.sender));
    }

    /**
     * @notice Allows the owner to approve a deployment to be executed. There must be at least
     *         `ownerBondAmount` deposited in this contract in order for a deployment to be approved.
     *         The owner can send the bond to this contract via a call to `depositETH` or `receive`.
     *         This bond will be forfeited if the project owner cancels an approved deployment. Also
     *         note that the deployment can be executed as soon as it is approved.
     *
     * @param _deploymentId ID of the deployment to approve
     */
    function approveChugSplashDeployment(bytes32 _deploymentId) external onlyOwner {
        ChugSplashDeploymentState storage deployment = _deployments[_deploymentId];

        if (deployment.remoteExecution) {
            require(
                address(this).balance - totalDebt() >= ownerBondAmount,
                "ChugSplashManager: insufficient balance in manager"
            );
        }

        require(
            deployment.status == DeploymentStatus.PROPOSED,
            "ChugSplashManager: deployment must be proposed"
        );

        require(activeDeploymentId == bytes32(0), "ChugSplashManager: another deployment is active");

        activeDeploymentId = _deploymentId;
        deployment.status = DeploymentStatus.APPROVED;

        emit ChugSplashDeploymentApproved(_deploymentId);
        registry.announce("ChugSplashDeploymentApproved");
    }

    function executeEntireDeployment(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _targetProofs,
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _actionProofs
    ) external {
        initiateExecution(_targets, _targetProofs);
        executeActions(_actions, _actionIndexes, _actionProofs);
        completeExecution(_targets, _targetProofs);
    }

    /**
     * @notice **WARNING**: Cancellation is a potentially dangerous action and should not be
     *         executed unless in an emergency.
     *
     *         Cancels an active ChugSplash deployment. If an executor has not claimed the deployment,
     *         the owner is simply allowed to withdraw their bond via a subsequent call to
     *         `withdrawOwnerETH`. Otherwise, cancelling a deployment will cause the project owner to
     *         forfeit their bond to the executor, and will also allow the executor to refund their
     *         own bond.
     */
    function cancelActiveChugSplashDeployment() external onlyOwner {
        require(activeDeploymentId != bytes32(0), "ChugSplashManager: no active deployment");

        ChugSplashDeploymentState storage deployment = _deployments[activeDeploymentId];

        if (deployment.remoteExecution && deployment.timeClaimed + executionLockTime >= block.timestamp) {
            // Give the owner's bond to the executor if the deployment is cancelled within the
            // `executionLockTime` window.
            totalExecutorDebt += ownerBondAmount;
        }

        bytes32 cancelledDeploymentId = activeDeploymentId;
        activeDeploymentId = bytes32(0);
        deployment.status = DeploymentStatus.CANCELLED;

        emit ChugSplashDeploymentCancelled(cancelledDeploymentId, msg.sender, deployment.actionsExecuted);
        registry.announce("ChugSplashDeploymentCancelled");
    }

    /**
     * @notice Allows an executor to post a bond of `executorBondAmount` to claim the sole right to
     *         execute actions for a deployment over a period of `executionLockTime`. Only the first
     *         executor to post a bond gains this right. Executors must finish executing the deployment
     *         within `executionLockTime` or else another executor may claim the deployment. Note that
     *         this strategy creates a PGA for the transaction to claim the deployment but removes PGAs
     *         during the execution process.
     */
    function claimDeployment() external onlyExecutor {
        require(activeDeploymentId != bytes32(0), "ChugSplashManager: no deployment is active");

        ChugSplashDeploymentState storage deployment = _deployments[activeDeploymentId];

        require(deployment.remoteExecution, "ChugSplashManager: local execution only");

        require(
            block.timestamp > deployment.timeClaimed + executionLockTime,
            "ChugSplashManager: deployment already claimed"
        );

        deployment.timeClaimed = block.timestamp;
        deployment.selectedExecutor = msg.sender;

        emit ChugSplashDeploymentClaimed(activeDeploymentId, msg.sender);
        registry.announce("ChugSplashDeploymentClaimed");
    }

    /**
     * @notice Allows executors to claim their ETH payments. Executors may only withdraw an amount
     *         less than or equal to the amount of ETH owed to them by this contract. We allow the
     *         executor to withdraw less than the amount owed to them because it's possible that the
     *         executor's debt exceeds the amount of ETH stored in this contract. This situation can
     *         occur when the executor completes an underfunded deployment.
     */
    function claimExecutorPayment(uint256 _amount) external onlyExecutor {
        require(_amount > 0, "ChugSplashManager: amount cannot be 0");
        require(
            executorDebt[msg.sender] >= _amount,
            "ChugSplashManager: insufficient executor debt"
        );

        executorDebt[msg.sender] -= _amount;
        totalExecutorDebt -= _amount;

        emit ExecutorPaymentClaimed(msg.sender, _amount, executorDebt[msg.sender]);

        (bool success, ) = payable(msg.sender).call{ value: _amount }(new bytes(0));
        require(success, "ChugSplashManager: failed to withdraw");

        registry.announce("ExecutorPaymentClaimed");
    }

    function claimProtocolPayment() external {
        require(
            managedService.hasRole(PROTOCOL_PAYMENT_RECIPIENT_ROLE, msg.sender),
            "ChugSplashManager: caller is not payment recipient"
        );

        uint256 amount = totalProtocolDebt;
        totalProtocolDebt = 0;

        emit ProtocolPaymentClaimed(msg.sender, amount);

        // slither-disable-next-line arbitrary-send-eth
        (bool success, ) = payable(msg.sender).call{ value: amount }(new bytes(0));
        require(success, "ChugSplashManager: failed to withdraw funds");

        registry.announce("ProtocolPaymentClaimed");
    }

    /**
     * @notice Transfers ownership of a proxy from this contract to a given address. Note that this
     *         function allows project owners to send ownership of their proxy to address(0), which
     *         would make their proxy non-upgradeable.
     *
     * @param _newOwner  Address of the project owner that is receiving ownership of the proxy.
     */
    function exportProxy(
        address payable _proxy,
        bytes32 _contractKindHash,
        address _newOwner
    ) external onlyOwner {
        require(_proxy.code.length > 0, "ChugSplashManager: invalid proxy");
        require(activeDeploymentId == bytes32(0), "ChugSplashManager: deployment is active");

        // Get the adapter that corresponds to this contract type.
        address adapter = registry.adapters(_contractKindHash);
        require(adapter != address(0), "ChugSplashManager: invalid contract kind");

        emit ProxyOwnershipTransferred(_proxy, _contractKindHash, _newOwner);

        // Delegatecall the adapter to change ownership of the proxy.
        // slither-disable-next-line controlled-delegatecall
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.changeProxyAdmin, (_proxy, _newOwner))
        );
        require(success, "ChugSplashManager: proxy admin change failed");

        registry.announce("ProxyOwnershipTransferred");
    }

    /**
     * @notice Allows the project owner to withdraw all funds in this contract minus the debt
     *         owed to the executor. Cannot be called when there is an active deployment.
     */
    function withdrawOwnerETH() external onlyOwner {
        require(
            activeDeploymentId == bytes32(0),
            "ChugSplashManager: cannot withdraw funds while deployment is active"
        );

        uint256 amount = address(this).balance - totalDebt();

        emit OwnerWithdrewETH(msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{ value: amount }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw owner funds failed");

        registry.announce("OwnerWithdrewETH");
    }

    /**
     * @notice Allows the owner of this contract to add or remove a proposer.
     *
     * @param _proposer Address of the proposer to add or remove.
     */
    function setProposer(address _proposer, bool _isProposer) external onlyOwner {
        proposers[_proposer] = _isProposer;

        emit ProposerSet(_proposer, _isProposer, msg.sender);
        registry.announceWithData("ProposerSet", abi.encodePacked(_isProposer));
    }

    function toggleAllowManagedProposals() external onlyOwner {
        allowManagedProposals = !allowManagedProposals;

        emit ToggledManagedProposals(allowManagedProposals, msg.sender);
        registry.announceWithData(
            "ToggledManagedProposals",
            abi.encodePacked(allowManagedProposals)
        );
    }

    /**
     * @notice Gets the ChugSplashDeploymentState struct for a given deployment ID. Note that we explicitly
     *         define this function because the getter auto-generated by Solidity doesn't return
     *         array members of structs: https://github.com/ethereum/solidity/issues/12792. Without
     *         this function, we wouldn't be able to return `ChugSplashDeploymentState.actions`.
     *
     * @param _deploymentId Deployment ID.
     *
     * @return ChugSplashDeploymentState struct.
     */
    function deployments(bytes32 _deploymentId) external view returns (ChugSplashDeploymentState memory) {
        return _deployments[_deploymentId];
    }

    /**
     * @notice Returns whether or not a deployment is currently being executed.
     *         Used to determine if the manager implementation can safely be upgraded.
     */
    function isExecuting() external view returns (bool) {
        return activeDeploymentId != bytes32(0);
    }

    /**
     * @notice Initiate the execution of a deployment. Note that non-proxied contracts are not
     *         included in the target tree.
     *
     * @param _targets Array of ChugSplashTarget objects.
     * @param _proofs  Array of Merkle proofs.
     */
    function initiateExecution(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        ChugSplashDeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        require(
            deployment.status == DeploymentStatus.APPROVED,
            "ChugSplashManager: status is not approved"
        );

        uint256 numTargets = _targets.length;
        require(numTargets == deployment.numTargets, "ChugSplashManager: incorrect number of targets");

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            require(
                target.contractKindHash != NO_PROXY_CONTRACT_KIND_HASH,
                "ChugSplashManager: only proxies allowed in target tree"
            );

            require(
                MerkleTree.verify(
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
                    deployment.numTargets
                ),
                "ChugSplashManager: invalid deployment target proof"
            );

            if (target.contractKindHash == bytes32(0) && target.addr.code.length == 0) {
                bytes32 salt = keccak256(abi.encode(target.projectName, target.referenceName));
                Proxy created = new Proxy{ salt: salt }(address(this));

                // Could happen if insufficient gas is supplied to this transaction, should not
                // happen otherwise. If there's a situation in which this could happen other than a
                // standard OOG, then this would halt the entire execution process.
                require(
                    address(created) == target.addr,
                    "ChugSplashManager: Proxy was not created correctly"
                );

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
            require(adapter != address(0), "ChugSplashManager: invalid contract kind");

            // Set the proxy's implementation to be a ProxyUpdater. Updaters ensure that only the
            // ChugSplashManager can interact with a proxy that is in the process of being updated.
            // Note that we use the Updater contract to provide a generic interface for updating a
            // variety of proxy types.
            // Note no adapter is necessary for non-proxied contracts as they are not upgradable and
            // cannot have state.
            // slither-disable-next-line controlled-delegatecall
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.initiateExecution, (target.addr))
            );
            require(success, "ChugSplashManager: failed to set implementation to an updater");
        }

        // Mark the deployment as initiated.
        deployment.status = DeploymentStatus.INITIATED;

        emit ChugSplashDeploymentInitiated(activeDeploymentId, msg.sender);
        registry.announce("ChugSplashDeploymentInitiated");

        _payExecutorAndProtocol(initialGasLeft, deployment.remoteExecution);
    }

    /**
     * @notice Executes multiple ChugSplash actions within the current active deployment for a project.
     *         Actions can only be executed once. A re-entrancy guard is added to prevent a
     *         contract's constructor from calling another contract which in turn
     *         calls back into this function. Only callable by the executor.
     *
     * @param _actions       Array of SetStorage/DeployContract actions to execute.
     * @param _actionIndexes Array of action indexes.
     * @param _proofs        Array of Merkle proofs for each action.
     */
    function executeActions(
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        ChugSplashDeploymentState storage deployment = _deployments[activeDeploymentId];

        require(
            deployment.status == DeploymentStatus.INITIATED,
            "ChugSplashManager: status must be initiated"
        );

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        uint256 numActions = _actions.length;
        ChugSplashAction memory action;
        uint256 actionIndex;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            action = _actions[i];
            actionIndex = _actionIndexes[i];
            proof = _proofs[i];

            require(
                !deployment.actions[actionIndex],
                "ChugSplashManager: action has already been executed"
            );

            require(
                MerkleTree.verify(
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
                ),
                "ChugSplashManager: invalid deployment action proof"
            );

            // Get the adapter for this reference name.
            address adapter = registry.adapters(action.contractKindHash);

            action.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH
                ? require(
                    action.actionType == ChugSplashActionType.DEPLOY_CONTRACT,
                    "ChugSplashManager: invalid action type for non-proxy contract"
                )
                : require(adapter != address(0), "ChugSplashManager: proxy type has no adapter");

            // Mark the action as executed and update the total number of executed actions.
            deployment.actionsExecuted++;
            deployment.actions[actionIndex] = true;

            // Next, we execute the ChugSplash action by calling deployContract/setStorage.
            if (action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                _deployContract(action.referenceName, action.data);
            } else if (action.actionType == ChugSplashActionType.SET_STORAGE) {
                (bytes32 key, uint8 offset, bytes memory val) = abi.decode(
                    action.data,
                    (bytes32, uint8, bytes)
                );
                _setProxyStorage(action.addr, adapter, key, offset, val);
            } else {
                revert("ChugSplashManager: unknown action type");
            }

            emit ChugSplashActionExecuted(activeDeploymentId, action.addr, msg.sender, actionIndex);
            registry.announceWithData("ChugSplashActionExecuted", abi.encodePacked(action.addr));
        }

        _payExecutorAndProtocol(initialGasLeft, deployment.remoteExecution);
    }

    /**
     * @notice Completes the deployment by upgrading all proxies to their new implementations. This
     *         occurs in a single transaction to ensure that all proxies are initialized at the same
     *         time. Note that this function will revert if it is called before all of the SetCode
     *         and DeployContract actions have been executed in `executeChugSplashAction`.
     *         Only callable by the executor.
     *
     * @param _targets Array of ChugSplashTarget objects.
     * @param _proofs  Array of Merkle proofs.
     */
    function completeExecution(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        ChugSplashDeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        require(
            activeDeploymentId != bytes32(0),
            "ChugSplashManager: no deployment has been approved for execution"
        );

        require(
            deployment.actionsExecuted == deployment.actions.length,
            "ChugSplashManager: deployment was not executed completely"
        );

        uint256 numTargets = _targets.length;
        require(numTargets == deployment.numTargets, "ChugSplashManager: incorrect number of targets");

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            require(
                target.contractKindHash != NO_PROXY_CONTRACT_KIND_HASH,
                "ChugSplashManager: only proxies allowed in target tree"
            );

            require(
                MerkleTree.verify(
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
                    deployment.numTargets
                ),
                "ChugSplashManager: invalid deployment target proof"
            );

            // Get the proxy type and adapter for this reference name.
            address adapter = registry.adapters(target.contractKindHash);
            require(adapter != address(0), "ChugSplashManager: invalid contract kind");

            // Upgrade the proxy's implementation contract.
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(
                    IProxyAdapter.completeExecution,
                    (target.addr, target.implementation)
                )
            );
            require(success, "ChugSplashManger: failed to complete execution");
        }

        // Mark the deployment as completed and reset the active deployment hash so that a new deployment can be
        // executed.
        deployment.status = DeploymentStatus.COMPLETED;
        bytes32 completedDeploymentId = activeDeploymentId;
        activeDeploymentId = bytes32(0);

        emit ChugSplashDeploymentCompleted(completedDeploymentId, msg.sender, deployment.actionsExecuted);
        registry.announce("ChugSplashDeploymentCompleted");

        _payExecutorAndProtocol(initialGasLeft, deployment.remoteExecution);
    }

    function isProposer(address _addr) public view returns (bool) {
        return
            (allowManagedProposals && managedService.hasRole(MANAGED_PROPOSER_ROLE, _addr)) ||
            proposers[_addr] ||
            _addr == owner();
    }

    function totalDebt() public view returns (uint256) {
        return totalExecutorDebt + totalProtocolDebt;
    }

    /**
     * @notice Queries the selected executor for a given project/deployment.
     *
     * @param _deploymentId ID of the deployment currently being executed.
     *
     * @return Address of the selected executor.
     */
    function getSelectedExecutor(bytes32 _deploymentId) public view returns (address) {
        ChugSplashDeploymentState storage deployment = _deployments[_deploymentId];
        return deployment.selectedExecutor;
    }

    function _payExecutorAndProtocol(uint256 _initialGasLeft, bool _remoteExecution) internal {
        if (!_remoteExecution) {
            return;
        }

        uint256 gasPrice = gasPriceCalculator.getGasPrice();

        // Estimate the gas used by the calldata. Note that, in general, 16 gas is used per non-zero
        // byte of calldata and 4 gas is used per zero-byte of calldata. We use 16 for simplicity
        // and because we must overestimate the executor's payment to ensure that it doesn't lose
        // money.
        uint256 calldataGasUsed = msg.data.length * 16;

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
        executorDebt[msg.sender] += executorPayment;

        // Add the protocol's payment to the protocol debt.
        totalProtocolDebt += protocolPayment;
    }

    /**
     * @notice Deploys a contract using the CREATE2 opcode.
     *
     *         If the user is deploying a proxied contract, then we deploy the implementation
     *         contract first and later set the proxy's implementation address to the implementation
     *         contract's address.
     *
     *         Note that we wait to set the proxy's implementation address until
     *         the very last call of the deployment to avoid a situation where end-users are interacting
     *         with a proxy whose storage has not been fully initialized.
     *
     * @param _referenceName Reference name that corresponds to the contract.
     * @param _code          Creation bytecode of the contract.
     */
    function _deployContract(string memory _referenceName, bytes memory _code) internal {
        // Get the expected address of the contract.
        address expectedAddress = create2.computeAddress(
            bytes32(0),
            keccak256(_code),
            address(this)
        );

        // Check if the contract has already been deployed.
        if (expectedAddress.code.length > 0) {
            // Skip deploying the contract if it already exists. Execution would halt if we attempt
            // to deploy a contract that has already been deployed at the same address.
            emit ContractDeploymentSkipped(
                _referenceName,
                expectedAddress,
                activeDeploymentId,
                _referenceName
            );
            registry.announce("ContractDeploymentSkipped");
        } else {
            address actualAddress;
            assembly {
                actualAddress := create2(0x0, add(_code, 0x20), mload(_code), 0x0)
            }

            // Could happen if insufficient gas is supplied to this transaction or if the creation
            // bytecode has logic that causes the call to fail (e.g. a constructor that reverts). We
            // check that the latter situation cannot occur using off-chain logic. If there's
            // another situation that could cause an address mismatch, this would halt the entire
            // execution process.
            require(
                expectedAddress == actualAddress,
                "ChugSplashManager: contract incorrectly deployed"
            );

            emit ContractDeployed(_referenceName, actualAddress, activeDeploymentId, _referenceName);
            registry.announce("ContractDeployed");
        }
    }

    /**
     * @notice Modifies a storage slot within the proxy contract.
     *
     * @param _proxy   Address of the proxy.
     * @param _adapter Address of the adapter for this proxy.
     * @param _key     Storage key to modify.
     * @param _value   New value for the storage key.
     */
    function _setProxyStorage(
        address payable _proxy,
        address _adapter,
        bytes32 _key,
        uint8 _offset,
        bytes memory _value
    ) internal {
        // Delegatecall the adapter to call `setStorage` on the proxy.
        // slither-disable-next-line controlled-delegatecall
        (bool success, ) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.setStorage, (_proxy, _key, _offset, _value))
        );
        require(success, "ChugSplashManager: set storage failed");
    }

    function _assertCallerIsOwnerOrSelectedExecutor(bool _remoteExecution) internal view {
        _remoteExecution
            ? require(
                getSelectedExecutor(activeDeploymentId) == msg.sender,
                "ChugSplashManager: caller is not approved executor"
            )
            : require(owner() == msg.sender, "ChugSplashManager: caller is not owner");
    }
}
