// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @notice Enum representing possible ChugSplash action types.
 */
enum ChugSplashActionType {
    SET_CODE,
    SET_STORAGE
}

/**
 * @notice Enum representing the status of a given ChugSplash action.
 */
enum ChugSplashBundleStatus {
    EMPTY,
    PROPOSED,
    APPROVED,
    COMPLETED
}
