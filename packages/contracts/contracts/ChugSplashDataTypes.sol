// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @notice Struct representing the state of a ChugSplash bundle.
 */
struct ChugSplashBundleState {
    ChugSplashBundleStatus status;
    bool[] executions;
    bytes32 merkleRoot;
    uint256 actionsExecuted;
    uint256 timeClaimed;
    address selectedExecutor;
}

/**
 * @notice Struct representing a ChugSplash action.
 */
struct ChugSplashAction {
    string referenceName;
    ChugSplashActionType actionType;
    bytes data;
}

/**
 * @notice Enum representing possible ChugSplash action types.
 */
enum ChugSplashActionType {
    SET_STORAGE,
    DEPLOY_IMPLEMENTATION,
    SET_IMPLEMENTATION
}

/**
 * @notice Enum representing the status of a given ChugSplash action.
 */
enum ChugSplashBundleStatus {
    EMPTY,
    PROPOSED,
    APPROVED,
    COMPLETED,
    CANCELLED
}
