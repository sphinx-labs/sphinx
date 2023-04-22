// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Version } from "../Semver.sol";

/**
 * @title ChugSplashManager
 * @notice Interface that must be inherited the ChugSplash manager.
 */
interface IChugSplashManager {
    function activeBundleId() external returns (bytes32);

    function proposers(address) external returns (bool);

    function isExecuting() external view returns (bool);

    function initialize(bytes memory) external;

    function version() external view returns (Version memory);
}
