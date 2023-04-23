// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashRegistry } from "../ChugSplashRegistry.sol";
import { Version } from "../Semver.sol";

/**
 * @title ChugSplashManager
 * @notice Interface that must be inherited the ChugSplash manager.
 */
interface IChugSplashManager {
    function isExecuting() external view returns (bool);

    function initialize(bytes memory) external;

    function registry() external view returns (ChugSplashRegistry);

    function organizationID() external view returns (bytes32);
}
