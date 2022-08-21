// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ProxyUpdater } from "./ProxyUpdater.sol";
import { IProxyAdapter } from "./IProxyAdapter.sol";

/**
 * @title ProxyAdmin
 * @notice The ProxyAdmin is a contract associated with each ChugSplashManager that owns the various
 *         proxies for a given project. The ProxyAdmin delegatecalls into various ProxyAdapter
 *         contracts that correspond to different proxy types. Using this pattern, the ProxyAdmin
 *         can universally handle all different proxy types as long as the ProxyAdmin is considered
 *         the owning address of each proxy.
 */
contract ProxyAdmin {
    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Address of the ProxyUpdater.
     */
    address public immutable proxyUpdater;

    /**
     * @param _registry     Address of the ChugSplashRegistry.
     * @param _proxyUpdater Address of the ProxyUpdater.
     */
    constructor(ChugSplashRegistry _registry, address _proxyUpdater) {
        registry = _registry;
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @notice Sets new code for the proxy contract's implementation.
     *
     * @param _proxy     Address of the proxy to upgrade.
     * @param _proxyType The proxy's type. This is the zero-address for default proxies.
     * @param _code      Creation bytecode to be deployed.
     */
    function setProxyCode(
        address payable _proxy,
        bytes32 _proxyType,
        bytes memory _code
    ) public {
        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ProxyAdmin: proxy type has no adapter");

        // Delegatecall the adapter to upgrade the proxy's implementation to be the
        // ProxyUpdater, which has the `setCode` function.
        _upgradeUsingAdapter(_proxy, adapter, proxyUpdater);

        // Delegatecall the adapter, which in turn will call the proxy to trigger a `setCode`
        // action.
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.setProxyCode, (_proxy, _code))
        );
        require(success, "ProxyAdmin: delegatecall to set proxy code failed");
    }

    /**
     * @notice Modifies a storage slot within the proxy contract.
     *
     * @param _proxy     Address of the proxy to upgrade.
     * @param _proxyType The proxy's type. This is the zero-address for default proxies.
     * @param _key       Storage key to modify.
     * @param _value     New value for the storage key.
     */
    function setProxyStorage(
        address payable _proxy,
        bytes32 _proxyType,
        bytes32 _key,
        bytes32 _value
    ) public {
        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ProxyAdmin: proxy type has no adapter");

        // Get the address of the current implementation for the proxy. The ProxyAdmin will set
        // the proxy's implementation back to this address after setting it to be the
        // ProxyUpdater and calling `setStorage`.
        (bool success, bytes memory implementationBytes) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.getProxyImplementation, ())
        );
        require(success, "ProxyAdmin: delegatecall to get proxy implementation failed");

        // Delegatecall the adapter to upgrade the proxy's implementation to be the
        // ProxyUpdater, which has the `setStorage` function.
        _upgradeUsingAdapter(_proxy, adapter, proxyUpdater);

        // Delegatecall the adapter, which in turn will call the proxy to trigger a `setStorage`
        // action.
        (bool setStorageSuccess, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.setProxyStorage, (_proxy, _key, _value))
        );
        require(setStorageSuccess, "ProxyAdmin: delegatecall to set proxy storage failed");

        // Convert the implementation's type from bytes to address.
        address implementation;
        assembly {
            implementation := mload(add(implementationBytes, 32))
        }

        // Delegatecall the adapter to set the proxy's implementation back to its original
        // address.
        _upgradeUsingAdapter(_proxy, adapter, implementation);
    }

    /**
     * @notice Delegatecalls an adapter to upgrade a proxy's implementation contract.
     *
     * @param _proxy          Address of the proxy to upgrade.
     * @param _adapter        Address of the adapter to use for the proxy.
     * @param _implementation Address to set as the proxy's new implementation contract.
     */
    function _upgradeUsingAdapter(
        address _proxy,
        address _adapter,
        address _implementation
    ) internal {
        (bool success, ) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.upgradeProxyTo, (_proxy, _implementation))
        );
        require(success, "ProxyAdmin: delegatecall to upgrade proxy failed");
    }
}
