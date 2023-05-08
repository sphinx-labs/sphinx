// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "../interfaces/IProxyUpdater.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";

/**
 * @title OZTransparentAdapter
 * @notice Adapter for an OpenZeppelin Transparent Upgradeable proxy.
 */
contract OZTransparentAdapter is IProxyAdapter {
    /**
     * @notice Address of the ProxyUpdater contract that will be set as the Transparent proxy's
       implementation during the deployment.
     */
    address public immutable proxyUpdater;

    /**
     * @param _proxyUpdater Address of the ProxyUpdater contract.
     */
    constructor(address _proxyUpdater) {
        require(_proxyUpdater != address(0), "OZTransparentAdapter: updater cannot be address(0)");
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateUpgrade(address payable _proxy) external {
        Proxy(_proxy).upgradeTo(proxyUpdater);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function finalizeUpgrade(address payable _proxy, address _implementation) external {
        Proxy(_proxy).upgradeTo(_implementation);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function setStorage(
        address payable _proxy,
        bytes32 _key,
        uint8 _offset,
        bytes memory _value
    ) external {
        require(_proxy.code.length > 0, "OZTransparentAdapter: invalid proxy");

        // We perform a low-level call here to avoid OpenZeppelin's `TransparentUpgradeableProxy`
        // reverting on successful calls, which is likely occurring because its `upgradeToAndCall`
        // function doesn't return any data.
        (bool success, ) = _proxy.call(
            abi.encodeCall(
                Proxy.upgradeToAndCall,
                (proxyUpdater, abi.encodeCall(IProxyUpdater.setStorage, (_key, _offset, _value)))
            )
        );
        require(success, "OZTransparentAdapter: call to set storage failed");
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
