// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IChugSplashManager } from "./IChugSplashManager.sol";

/**
 * @title ChugSplashRegistry
 * @notice Interface that must be inherited the ChugSplash registry.
 */
interface IChugSplashRegistry {
    function projects(bytes32) external returns (IChugSplashManager);
}
