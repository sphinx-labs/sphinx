// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    DeploymentState,
    RawSphinxAction,
    SphinxTarget,
    SphinxActionType,
    DeploymentStatus
} from "./SphinxDataTypes.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ISphinxRegistry } from "./interfaces/ISphinxRegistry.sol";
import { ISphinxManager } from "./interfaces/ISphinxManager.sol";
import { IProxyAdapter } from "./interfaces/IProxyAdapter.sol";
import {
    Lib_MerkleTree as MerkleTree
} from "@eth-optimism/contracts/libraries/utils/Lib_MerkleTree.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import {
    IAccessControlEnumerable
} from "@openzeppelin/contracts/access/IAccessControlEnumerable.sol";
import { ISphinxCreate3 } from "./interfaces/ISphinxCreate3.sol";
import { Semver, Version } from "./Semver.sol";
import {
    ContextUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { SphinxManagerEvents } from "./SphinxManagerEvents.sol";

/**
 * @title SphinxManager
 * @custom:version 0.2.5
 * @notice This contract contains the logic for managing the entire lifecycle of a project's
 *         deployments. It contains the functionality for approving and executing deployments and
 *         exporting proxies out of the Sphinx system if desired. It exists as a single
 *         implementation contract behind SphinxManagerProxy contracts, which are each owned by a
 *         single project team.
 *
 *         After a deployment is approved, it is executed in the following steps, which must occur
 *         in order:
 *         1. The `executeInitialActions` function: `DEPLOY_CONTRACT` and `CALL` actions are
 *            executed in ascending order according to their index.
 *         The next steps only occur if the deployment is upgrading proxies.
 *         2. The `initiateProxies` function: sets the implementation of each proxy to a contract
 *            that can only be called by the user's SphinxManager. This ensures that the upgrade is
 *            atomic, which means that all proxies are upgraded in a single transaction.
 *         3. Execute all of the `SET_STORAGE` actions using the `executeActions` function.
 *         4. The `completeUpgrade` function, which upgrades all of the proxies to their new
 *            implementations in a single transaction.
 */
contract SphinxManager is
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    Semver,
    ISphinxManager,
    SphinxManagerEvents
{
    /**
     * @notice Role required to be a remote executor for a deployment.
     */
    bytes32 internal constant REMOTE_EXECUTOR_ROLE = keccak256("REMOTE_EXECUTOR_ROLE");

    /**
     * @notice The contract kind hash for immutable contracts. This does not include
     *         implementation contracts that exist behind proxies.
     */
    bytes32 internal constant IMMUTABLE_CONTRACT_KIND_HASH = keccak256("immutable");

    /**
     * @notice The contract kind hash for implementation contracts, which exist behind proxies.
     */
    bytes32 internal constant IMPLEMENTATION_CONTRACT_KIND_HASH = keccak256("implementation");

    /**
     * @notice Address of the SphinxRegistry.
     */
    ISphinxRegistry public immutable registry;

    /**
     * @notice Address of the ManagedService contract.
     */
    address public immutable managedService;

    string public projectName;

    /**
     * @notice Address of the Create3 contract.
     */
    address internal immutable create3;

    /**
     * @notice Amount of time for a remote executor to finish executing a deployment once they have
       claimed it.
     */
    uint256 internal immutable executionLockTime;

    /**
     * @notice Mapping of deployment IDs to deployment state.
     */
    mapping(bytes32 => DeploymentState) private _deployments;

    /**
     * @notice ID of the currently active deployment.
     */
    bytes32 public activeDeploymentId;

    // TODO(test): see if openzeppelin catches the fact that you removed a storage variable.

    /**
     * @notice Reverts if the caller is not a remote executor.
     */
    error CallerIsNotRemoteExecutor();

    /**
     * @notice Reverts if the deployment state cannot be approved.
     */
    error DeploymentStateIsNotApprovable();

    /**
     * @notice Reverts if there is another active deployment ID.
     */
    error DeploymentInProgress();

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
     * @notice Reverts if an action is executed out of order.
     */
    error InvalidActionIndex();

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
     * @notice Reverts if a function is called in an incorrect order during the deployment
     *        process.
     */
    error InvalidDeploymentStatus();

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

    error EmptyProjectName();
    error ProjectNameCannotBeEmpty();
    error InvalidAddress();

    /**
     * @notice Reverts if the deployment fails due to an error in a contract constructor
     *         or call.
     * @param deploymentId ID of the deployment that failed.
     * @param actionIndex  Index of the action that caused the deployment to fail.
     */
    error DeploymentFailed(uint256 actionIndex, bytes32 deploymentId);

    /**
     * @notice Modifier that reverts if the caller is not a remote executor.
     */
    modifier onlyExecutor() {
        if (!IAccessControl(managedService).hasRole(REMOTE_EXECUTOR_ROLE, msg.sender)) {
            revert CallerIsNotRemoteExecutor();
        }
        _;
    }

    /**
     * @param _registry                  Address of the SphinxRegistry.
     * @param _create3                   Address of the Create3 contract.
     * @param _managedService            Address of the ManagedService contract.
     * @param _executionLockTime         Amount of time for a remote executor to completely execute
       a deployment after claiming it.
     * @param _version                   Version of this contract.
     */
    constructor(
        ISphinxRegistry _registry,
        address _create3,
        address _managedService,
        uint256 _executionLockTime,
        Version memory _version
    ) Semver(_version.major, _version.minor, _version.patch) {
        registry = _registry;
        create3 = _create3;
        managedService = _managedService;
        executionLockTime = _executionLockTime;

        _disableInitializers();
    }

    /**
     * @inheritdoc ISphinxManager

     * @return Empty bytes.
     */
    function initialize(
        address _owner,
        string memory _projectName,
        bytes memory
    ) external initializer returns (bytes memory) {
        if (bytes(_projectName).length == 0) revert EmptyProjectName();

        projectName = _projectName;

        __ReentrancyGuard_init();
        __Ownable_init();
        _transferOwnership(_owner);

        return "";
    }

    /**
     * @notice Approve a deployment. Only callable by the owner of this contract.
     *
     * @param _actionRoot Root of the Merkle tree containing the actions for the deployment.
     * This may be `bytes32(0)` if there are no actions in the deployment.
     * @param _targetRoot Root of the Merkle tree containing the targets for the deployment.
     * This may be `bytes32(0)` if there are no targets in the deployment.
     * @param _numInitialActions Number of `DEPLOY_CONTRACT` and `CALL` actions in the deployment.
     * @param _numTargets Number of targets in the deployment.
     * @param _configUri  URI pointing to the config file for the deployment.
     * @param _remoteExecution Whether or not to allow remote execution of the deployment.
     */
    function approve(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numInitialActions,
        uint256 _numSetStorageActions,
        uint256 _numTargets,
        string memory _configUri,
        bool _remoteExecution
    ) public onlyOwner {
        if (activeDeploymentId != bytes32(0)) {
            revert DeploymentInProgress();
        }

        // Compute the deployment ID.
        bytes32 deploymentId = keccak256(
            abi.encode(
                _actionRoot,
                _targetRoot,
                _numInitialActions,
                _numSetStorageActions,
                _numTargets,
                _configUri
            )
        );

        DeploymentState storage deployment = _deployments[deploymentId];

        DeploymentStatus status = deployment.status;
        if (
            status != DeploymentStatus.EMPTY &&
            status != DeploymentStatus.COMPLETED &&
            status != DeploymentStatus.CANCELLED
        ) {
            revert DeploymentStateIsNotApprovable();
        }

        activeDeploymentId = deploymentId;

        deployment.status = DeploymentStatus.APPROVED;
        deployment.actionRoot = _actionRoot;
        deployment.targetRoot = _targetRoot;
        deployment.numInitialActions = _numInitialActions;
        deployment.numSetStorageActions = _numSetStorageActions;
        deployment.targets = _numTargets;
        deployment.remoteExecution = _remoteExecution;
        deployment.configUri = _configUri;

        emit SphinxDeploymentApproved(
            deploymentId,
            _actionRoot,
            _targetRoot,
            _numInitialActions,
            _numSetStorageActions,
            _numTargets,
            _configUri,
            _remoteExecution,
            msg.sender
        );
        registry.announceWithData("SphinxDeploymentApproved", abi.encodePacked(msg.sender));
    }

    /**
     * @notice Helper function that executes an entire upgrade in a single transaction. This allows
       the proxies in smaller upgrades to have zero downtime. This must occur after all of the
       initial `DEPLOY_CONTRACT` and `CALL` actions have been executed.
     */
    function executeEntireUpgrade(
        SphinxTarget[] memory _targets,
        bytes32[][] memory _targetProofs,
        RawSphinxAction[] memory _setStorageActions,
        bytes32[][] memory _setStorageProofs
    ) external {
        initiateUpgrade(_targets, _targetProofs);

        // Execute the `SET_STORAGE` actions if there are any.
        if (_setStorageActions.length > 0) {
            setStorage(_setStorageActions, _setStorageProofs);
        }

        finalizeUpgrade(_targets, _targetProofs);
    }

    /**
     * @notice **WARNING**: Cancellation is a potentially dangerous action and should not be
     *         executed unless in an emergency.
     *
     *         Allows the owner to cancel an active deployment that was approved.
     */
    function cancelActiveSphinxDeployment() external onlyOwner {
        if (activeDeploymentId == bytes32(0)) {
            revert NoActiveDeployment();
        }

        DeploymentState storage deployment = _deployments[activeDeploymentId];

        bytes32 cancelledDeploymentId = activeDeploymentId;
        activeDeploymentId = bytes32(0);
        deployment.status = DeploymentStatus.CANCELLED;

        emit SphinxDeploymentCancelled(
            cancelledDeploymentId,
            msg.sender,
            deployment.actionsExecuted
        );
        registry.announce("SphinxDeploymentCancelled");
    }

    // TODO: bump manager version

    /**
     * @notice Allows a remote executor to claim the sole right to execute a deployment over a
               period of `executionLockTime`. Executors must finish executing the deployment within
               `executionLockTime` or else another executor may claim the deployment.
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
        deployment.selectedExecutor = msg.sender;

        emit SphinxDeploymentClaimed(activeDeploymentId, msg.sender);
        registry.announce("SphinxDeploymentClaimed");
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
            revert DeploymentInProgress();
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

    function transferOwnership(address _newOwner) public override onlyOwner {
        if (_newOwner == address(0)) revert InvalidAddress();
        _transferOwnership(_newOwner);
        registry.announceWithData("OwnershipTransferred", abi.encodePacked(_newOwner));
    }

    function renounceOwnership() public override onlyOwner {
        _transferOwnership(address(0));
        registry.announceWithData("OwnershipTransferred", abi.encodePacked(address(0)));
    }

    /**
     * @notice Gets the DeploymentState struct for a given deployment ID. Note that we explicitly
     *         define this function because the getter function auto-generated by Solidity doesn't
     *         return array members of structs: https://github.com/ethereum/solidity/issues/12792.
     *         If we remove this function and make the `_deployments` mapping public, we will get a
     *         compilation error for this reason.
     *
     * @param _deploymentId Deployment ID.
     *
     * @return DeploymentState struct.
     */
    function deployments(bytes32 _deploymentId) external view returns (DeploymentState memory) {
        return _deployments[_deploymentId];
    }

    /**
     * @inheritdoc ISphinxManager
     */
    function isExecuting() external view returns (bool) {
        return activeDeploymentId != bytes32(0);
    }

    /**
     * @notice Deploys contracts and executes arbitrary calls in a deployment. This must be called
     *         after the deployment is approved. A contract deployment will be skipped if a contract
     *         already exists at its CREATE3 address. If a contract deployment or call fails, the
     *         entire deployment will be marked as `FAILED` and no further actions will be executed.
     *
     * @param _actions The `DEPLOY_CONTRACT` and `CALL` actions to execute.
     * @param _proofs The Merkle proofs for the actions.
     */
    function executeInitialActions(
        RawSphinxAction[] memory _actions,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        DeploymentState storage deployment = _deployments[activeDeploymentId];
        if (deployment.status != DeploymentStatus.APPROVED) revert InvalidDeploymentStatus();

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        uint256 numActions = _actions.length;
        uint256 numTotalActions = deployment.numInitialActions + deployment.numSetStorageActions;

        // Prevents the executor from repeatedly sending an empty array of `_actions`, which would
        // cause the executor to be paid for doing nothing.
        if (numActions == 0) {
            revert EmptyActionsArray();
        }

        RawSphinxAction memory action;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            action = _actions[i];
            proof = _proofs[i];

            if (deployment.actionsExecuted != action.index) {
                revert InvalidActionIndex();
            }

            if (
                !MerkleTree.verify(
                    deployment.actionRoot,
                    keccak256(abi.encode(action.actionType, action.data)),
                    action.index,
                    proof,
                    numTotalActions
                )
            ) {
                revert InvalidMerkleProof();
            }

            deployment.actionsExecuted++;

            if (action.actionType == SphinxActionType.CALL) {
                (address to, bytes memory data) = abi.decode(
                    action.data,
                    (address, bytes)
                );
                (bool success, ) = to.call(data);
                if (success) {
                    emit CallExecuted(activeDeploymentId, action.index);
                    registry.announce("CallExecuted");
                } else {
                    // External call failed. Could happen if insufficient gas is supplied
                    // to this transaction or if the function has logic that causes the call to
                    // fail.
                    revert DeploymentFailed(action.index, activeDeploymentId);
                }
            } else if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (bytes32 salt, bytes memory creationCodeWithConstructorArgs) = abi.decode(
                    action.data,
                    (bytes32, bytes)
                );
                address expectedAddress = ISphinxCreate3(create3).getAddressFromDeployer(
                    salt,
                    address(this)
                );

                // Check if the contract has already been deployed.
                if (expectedAddress.code.length > 0) {
                    // Skip deploying the contract if it already exists. Execution would halt if
                    // we attempt to deploy a contract that has already been deployed at the same
                    // address.
                    emit ContractDeploymentSkipped(
                        expectedAddress,
                        activeDeploymentId,
                        action.index
                    );
                    registry.announce("ContractDeploymentSkipped");
                } else {
                    // We delegatecall the Create3 contract so that the SphinxManager address is
                    // used in the address calculation of the deployed contract. If we call the
                    // Create3 contract instead of delegatecalling it, it'd be possible for an
                    // attacker to deploy a malicious contract at the expected address by calling
                    // the `deploy` function on the Create3 contract directly.
                    (bool deploySuccess, ) = create3.delegatecall(
                        abi.encodeCall(
                            ISphinxCreate3.deploy,
                            (salt, creationCodeWithConstructorArgs, 0)
                        )
                    );

                    if (deploySuccess) {
                        emit ContractDeployed(
                            expectedAddress,
                            activeDeploymentId,
                            keccak256(creationCodeWithConstructorArgs)
                        );
                        registry.announce("ContractDeployed");
                    } else {
                        // Contract deployment failed. Could happen if insufficient gas is supplied
                        // to this transaction or if the creation bytecode has logic that causes the
                        // call to fail (e.g. a constructor that reverts).
                        revert DeploymentFailed(action.index, activeDeploymentId);
                    }
                }
            } else {
                revert InvalidActionType();
            }
        }

        // If all of the actions have been executed, mark the deployment as completed. This will
        // always be the case unless the deployment is upgrading proxies.
        if (deployment.actionsExecuted == deployment.numInitialActions) {
            if (deployment.targets == 0) {
                _completeDeployment(deployment);
            } else {
                deployment.status = DeploymentStatus.INITIAL_ACTIONS_EXECUTED;
            }
        }
    }

    /**
     * @notice Initiate the proxies in an upgrade. This must be called after the contracts are
       deployment is approved, and before the rest of the execution process occurs. In this
       function, all of the proxies in the deployment are disabled by setting their implementations
       to a contract that can only be called by the team's SphinxManagerProxy. This must occur
       in a single transaction to make the process atomic, which means the proxies are upgraded as a
       single unit.

     * @param _targets Array of SphinxTarget structs containing the targets for the deployment.
     * @param _proofs Array of Merkle proofs for the targets.
     */
    function initiateUpgrade(
        SphinxTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        DeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        if (deployment.status != DeploymentStatus.INITIAL_ACTIONS_EXECUTED)
            revert InvalidDeploymentStatus();

        uint256 numTargets = _targets.length;
        if (numTargets != deployment.targets) {
            revert IncorrectNumberOfTargets();
        }

        SphinxTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            if (
                target.contractKindHash == IMMUTABLE_CONTRACT_KIND_HASH ||
                target.contractKindHash == IMPLEMENTATION_CONTRACT_KIND_HASH
            ) {
                revert OnlyProxiesAllowed();
            }

            if (
                !MerkleTree.verify(
                    deployment.targetRoot,
                    keccak256(
                        abi.encode(target.addr, target.implementation, target.contractKindHash)
                    ),
                    i,
                    proof,
                    deployment.targets
                )
            ) {
                revert InvalidMerkleProof();
            }

            address adapter = registry.adapters(target.contractKindHash);
            if (adapter == address(0)) {
                revert InvalidContractKind();
            }

            // Set the proxy's implementation to be a ProxyUpdater. Updaters ensure that only the
            // SphinxManager can interact with a proxy that is in the process of being updated.
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

        emit ProxiesInitiated(activeDeploymentId, msg.sender);
        registry.announce("ProxiesInitiated");
    }

    /**
     * @notice Sets storage values within proxies to upgrade them. Must be called after
     *         the `initiateProxies` function.
     *
     * @param _actions The `SET_STORAGE` actions to execute.
     * @param _proofs The Merkle proofs for the actions.
     */
    function setStorage(
        RawSphinxAction[] memory _actions,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        DeploymentState storage deployment = _deployments[activeDeploymentId];
        if (deployment.status != DeploymentStatus.PROXIES_INITIATED)
            revert InvalidDeploymentStatus();

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        uint256 numActions = _actions.length;
        uint256 numTotalActions = deployment.numInitialActions + deployment.numSetStorageActions;

        // Prevents the executor from repeatedly sending an empty array of `_actions`, which would
        // cause the executor to be paid for doing nothing.
        if (numActions == 0) {
            revert EmptyActionsArray();
        }

        RawSphinxAction memory action;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            action = _actions[i];
            proof = _proofs[i];

            if (deployment.actionsExecuted != action.index) {
                revert InvalidActionIndex();
            }
            if (action.actionType != SphinxActionType.SET_STORAGE) revert InvalidActionType();

            if (
                !MerkleTree.verify(
                    deployment.actionRoot,
                    keccak256(abi.encode(action.actionType, action.data)),
                    action.index,
                    proof,
                    numTotalActions
                )
            ) {
                revert InvalidMerkleProof();
            }

            deployment.actionsExecuted++;

            (
                bytes32 contractKindHash,
                address to,
                bytes32 key,
                uint8 offset,
                bytes memory val
            ) = abi.decode(action.data, (bytes32, address, bytes32, uint8, bytes));

            if (
                contractKindHash == IMMUTABLE_CONTRACT_KIND_HASH ||
                contractKindHash == IMPLEMENTATION_CONTRACT_KIND_HASH
            ) {
                revert OnlyProxiesAllowed();
            }

            // Get the adapter for this reference name.
            address adapter = registry.adapters(contractKindHash);

            // Delegatecall the adapter to call `setStorage` on the proxy.
            // slither-disable-next-line controlled-delegatecall
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.setStorage, (payable(to), key, offset, val))
            );
            if (!success) {
                revert SetStorageFailed();
            }

            emit SetProxyStorage(activeDeploymentId, to, msg.sender, action.index);
            registry.announce("SetProxyStorage");
        }

        if (deployment.actionsExecuted == numTotalActions) {
            deployment.status = DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED;
        }
    }

    /**
     * @notice Finalizes the upgrade by upgrading all proxies to their new implementations. This
     *         occurs in a single transaction to ensure that the upgrade is atomic.
     *
     * @param _targets Array of SphinxTarget structs containing the targets for the deployment.
     * @param _proofs Array of Merkle proofs for the targets.
     */
    function finalizeUpgrade(
        SphinxTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        DeploymentState storage deployment = _deployments[activeDeploymentId];

        _assertCallerIsOwnerOrSelectedExecutor(deployment.remoteExecution);

        if (deployment.status != DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED)
            revert InvalidDeploymentStatus();

        uint256 numTargets = _targets.length;
        if (numTargets != deployment.targets) {
            revert IncorrectNumberOfTargets();
        }

        SphinxTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            if (
                target.contractKindHash == IMMUTABLE_CONTRACT_KIND_HASH ||
                target.contractKindHash == IMPLEMENTATION_CONTRACT_KIND_HASH
            ) {
                revert OnlyProxiesAllowed();
            }

            if (
                !MerkleTree.verify(
                    deployment.targetRoot,
                    keccak256(
                        abi.encode(target.addr, target.implementation, target.contractKindHash)
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

            emit ProxyUpgraded(activeDeploymentId, target.addr);
            registry.announceWithData("ProxyUpgraded", abi.encodePacked(target.addr));
        }

        _completeDeployment(deployment);
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
     * @notice Mark the deployment as completed and reset the active deployment ID.

     * @param _deployment The current deployment state struct. The data location is "s  rage"
       because we modify the struct.
     */
    function _completeDeployment(DeploymentState storage _deployment) private {
        _deployment.status = DeploymentStatus.COMPLETED;

        emit SphinxDeploymentCompleted(activeDeploymentId, msg.sender);
        registry.announce("SphinxDeploymentCompleted");

        activeDeploymentId = bytes32(0);
    }

    /**
     * @notice If the deployment is being executed remotely, this function will check that the
     * caller is the selected executor. If the deployment is being executed locally, this function
     * will check that the caller is the owner. Throws an error otherwise.

       @param _remoteExecution True if the deployment is being executed remotely, otherwise false.

     */
    function _assertCallerIsOwnerOrSelectedExecutor(bool _remoteExecution) internal view {
        if (_remoteExecution && getSelectedExecutor(activeDeploymentId) != msg.sender) {
            revert CallerIsNotSelectedExecutor();
        } else if (!_remoteExecution) {
            // Non-remote deployments can only be executed if there is a single owner of the
            // SphinxAuth contract, which owns this contract. In other words, we don't currently
            // support non-remote deployments that have multiple owners.
            IAccessControlEnumerable auth = IAccessControlEnumerable(owner());
            if (!auth.hasRole(bytes32(0), msg.sender) || auth.getRoleMemberCount(bytes32(0)) != 1)
                revert CallerIsNotOwner();
        }
    }
}
