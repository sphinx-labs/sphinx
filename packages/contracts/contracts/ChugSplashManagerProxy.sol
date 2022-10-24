// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Proxy } from "./libraries/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";

/**
 * @title ChugSplashManagerProxy
 */
contract ChugSplashManagerProxy is Proxy {
    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registryProxy;

    /**
     * @param _registryProxy The ChugSplashRegistry's proxy.
     * @param _admin         Owner of this contract.
     */
    constructor(ChugSplashRegistry _registryProxy, address _admin) payable Proxy(_admin) {
        registryProxy = _registryProxy;
    }

    /**
     * @notice The implementation contract for this proxy is stored in the ChugSplashRegistry's
     *         proxy.
     */
    function _getImplementation() internal view override returns (address) {
        return registryProxy.managerImplementation();
    }
}
