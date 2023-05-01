// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @notice Struct representing the state of a ChugSplash deployment.
 */
struct DeploymentState {
    DeploymentStatus status;
    bool[] actions;
    uint256 targets;
    bytes32 actionRoot;
    bytes32 targetRoot;
    uint256 actionsExecuted;
    uint256 timeClaimed;
    address selectedExecutor;
    bool remoteExecution;
}

/**
 * @notice Struct representing a ChugSplash action.
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
 */
enum ChugSplashActionType {
    SET_STORAGE,
    DEPLOY_CONTRACT
}

/**
 * @notice Enum representing the status of a given ChugSplash action.
 */
enum DeploymentStatus {
    EMPTY,
    PROPOSED,
    APPROVED,
    INITIATED,
    COMPLETED,
    CANCELLED
}
