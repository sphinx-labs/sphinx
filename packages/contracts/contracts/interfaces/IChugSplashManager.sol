// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplashRegistry } from "../ChugSplashRegistry.sol";
import { Version } from "../Semver.sol";

/**
 * @title ChugSplashManager
 * @notice Interface that must be inherited the ChugSplash manager.
 */
interface IChugSplashManager {
    function initialize(bytes memory) external returns (bytes memory);

    function isExecuting() external view returns (bool);

    function registry() external view returns (ChugSplashRegistry);

    function organizationID() external view returns (bytes32);
}
