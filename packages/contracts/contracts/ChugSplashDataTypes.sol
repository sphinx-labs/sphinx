// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @notice Struct representing an entire ChugSplash bundle.
 */
struct ChugSplashBundle {
    ChugSplashActionWithProof[] actions;
    bytes32 root;
}

/**
 * @notice Struct representing a single ChugSplash action along with its Merkle proof.
 */
struct ChugSplashActionWithProof {
    ChugSplashAction action;
    ChugSplashProof proof;
}

/**
 * @notice Struct representing a Merkle proof for a single ChugSplash action.
 */
struct ChugSplashProof {
    uint256 actionIndex;
    bytes32[] siblings;
}

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
    ChugSplashActionType actionType;
    bytes data;
    string referenceName;
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
