// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashActionType, ChugSplashBundleStatus } from "./ChugSplashEnums.sol";

/**
 * @notice Struct representing a ChugSplash action.
 */
struct ChugSplashAction {
    string target;
    ChugSplashActionType actionType;
    bytes data;
}

/**
 * @notice Struct representing the state of a ChugSplash bundle.
 */
struct ChugSplashBundleState {
    ChugSplashBundleStatus status;
    bool[] executions;
    uint256 total;
}
