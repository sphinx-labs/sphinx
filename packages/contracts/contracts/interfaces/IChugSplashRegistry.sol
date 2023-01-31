// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title IChugSplashRegistry
 */
interface IChugSplashRegistry {
    // TODO: Add remaining functions once the interface has stabilized. Note that changing this
    // interface will change the ChugSplashManagerProxy bytecode (since it imports
    // `ChugSplashRegistry`). This will in turn change the addresses of the `getChugSplashManager`
    // TypeScript function.

    function managerImplementation() external view returns (address);
}
