// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @notice Struct representing the state of a ChugSplash deployment.
 *
 * @custom:field status           Status of the deployment.
 * @custom:field actions          Array indicating which actions in the deployment have been executed.
 * @custom:field numTargets          Number of targets in the deployment.
 * @custom:field actionRoot       Root of the Merkle tree of actions in the deployment.
 * @custom:field targetRoot       Root of the Merkle tree of targets in the deployment.
 * @custom:field actionsExecuted  Number of actions that have been executed in the deployment.
 * @custom:field timeClaimed      Timestamp at which the deployment was claimed.
 * @custom:field selectedExecutor Address of the selected executor for the deployment.
 * @custom:field remoteExecution  Whether the deployment should be executed remotely.
 */
struct ChugSplashDeploymentState {
    DeploymentStatus status;
    bool[] actions;
    uint256 numTargets;
    bytes32 actionRoot;
    bytes32 targetRoot;
    uint256 actionsExecuted;
    uint256 timeClaimed;
    address selectedExecutor;
    bool remoteExecution;
}

/**
 * @notice Struct representing a ChugSplash action.
 *
 * @custom:field actionType       Type of the action (set storage or deploy contract).
 * @custom:field data             Data associated with the action.
 * @custom:field addr             Address of the contract associated with the action.
 * @custom:field contractKindHash Hash of the contract kind associated with the action.
 * @custom:field referenceName    Reference name associated with the action.
 */
struct ChugSplashAction {
    ChugSplashActionType actionType;
    bytes data;
    address payable addr;
    bytes32 contractKindHash;
    string referenceName;
}

/**
 * @notice Struct representing a ChugSplash target.
 *
 * @custom:field projectName     Name of the project associated with the target.
 * @custom:field referenceName   Reference name associated with the target.
 * @custom:field addr            Address of the target.
 * @custom:field implementation  Address of the implementation associated with the target.
 * @custom:field contractKindHash Hash of the contract kind associated with the target.
 */
struct ChugSplashTarget {
    string projectName;
    string referenceName;
    address payable addr;
    address implementation;
    bytes32 contractKindHash;
}

/**
 * @notice Enum representing possible ChugSplash action types.
 *
 * @custom:member SET_STORAGE
 * @custom:member DEPLOY_CONTRACT
 */
enum ChugSplashActionType {
    SET_STORAGE,
    DEPLOY_CONTRACT
}

/**
 * @notice Enum representing the status of a given ChugSplash action.
 *
 * @custom:member EMPTY
 * @custom:member PROPOSED
 * @custom:member APPROVED
 * @custom:member INITIATED
 * @custom:member COMPLETED
 * @custom:member CANCELLED
 */
enum DeploymentStatus {
    EMPTY,
    PROPOSED,
    APPROVED,
    INITIATED,
    COMPLETED,
    CANCELLED
}
