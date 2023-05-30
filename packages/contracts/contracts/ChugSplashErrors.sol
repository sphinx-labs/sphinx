// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

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
