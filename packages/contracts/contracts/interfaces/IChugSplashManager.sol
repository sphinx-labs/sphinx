// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title ChugSplashManager
 * @notice Interface that must be inherited the ChugSplash manager.
 */
interface IChugSplashManager {
    function activeBundleId() external returns (bytes32);

    function proposers(address) external returns (bool);

    function isExecuting() external view returns (bool);
}
