// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Proxy } from "./libraries/Proxy.sol";
import { ChugSplashRegistryProxy } from "./ChugSplashRegistryProxy.sol";

/**
 * @title ChugSplashManagerProxy
 * @notice BEWARE: This contract should be stable while ChugSplash is upgradeable because its
 *         bytecode determines the addresses of contracts deployed by ChugSplash (via `CREATE2`).
 */
contract ChugSplashManagerProxy is Proxy {
    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistryProxy public immutable registryProxy;

    /**
     * @param _registryProxy The ChugSplashRegistry's proxy.
     * @param _admin         Owner of this contract.
     */
    constructor(address _registryProxy, address _admin) payable Proxy(_admin) {
        registryProxy = ChugSplashRegistryProxy(payable(_registryProxy));
    }

    /**
     * @notice The implementation contract for this proxy is stored in the ChugSplashRegistry's
     *         proxy.
     */
    function _getImplementation() internal view override returns (address) {
        return registryProxy.managerImplementation();
    }
}
