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
    address payable proxy;
    bytes32 contractKindHash;
    string referenceName;
}

/**
 * @notice Struct representing a ChugSplash target.
 */
struct ChugSplashTarget {
    string projectName;
    string referenceName;
    address payable proxy;
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
enum ChugSplashBundleStatus {
    EMPTY,
    PROPOSED,
    APPROVED,
    INITIATED,
    COMPLETED,
    CANCELLED
}
