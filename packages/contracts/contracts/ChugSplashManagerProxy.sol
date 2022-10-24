// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";

/**
 * @title ChugSplashManagerProxy
 */
contract ChugSplashManagerProxy is TransparentUpgradeableProxy {
    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registryProxy;

    /**
     * @param _registryProxy The ChugSplashRegistry's proxy.
     * @param _logic         Address of the ChugSplashManager implementation contract.
     * @param _admin         Owner of this contract.
     * @param _data          Data to initialize this contract.
     */
    constructor(
        ChugSplashRegistry _registryProxy,
        address _logic,
        address _admin,
        bytes memory _data
    ) payable TransparentUpgradeableProxy(_logic, _admin, _data) {
        registryProxy = _registryProxy;
    }

    /**
     * @notice The implementation contract for this proxy is stored in the ChugSplashRegistry's
     *         proxy.
     */
    function _implementation() internal view override returns (address) {
        return registryProxy.managerImplementation();
    }
}
