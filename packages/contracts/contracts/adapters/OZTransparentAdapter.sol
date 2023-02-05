// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../IProxyAdapter.sol";
import { IProxyUpdater } from "../IProxyUpdater.sol";
import { Proxy } from "../libraries/Proxy.sol";

/**
 * @title DefaultAdapter
 * @notice Adapter for an OpenZeppelin Transparent Upgradeable proxy. This is the adapter used by
 *         default proxies in the ChugSplash system. To learn more about the transparent proxy
 *         pattern, see: https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent_proxy
 */
contract OZTransparentAdapter is IProxyAdapter {
    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateExecution(address payable _proxy, address _implementation) external {
        Proxy(_proxy).upgradeTo(_implementation);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function completeExecution(address payable _proxy, address _implementation) external {
        Proxy(_proxy).upgradeTo(_implementation);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function setStorage(address payable _proxy, bytes32 _key, bytes32 _value) external {
        // We perform a low-level call here to avoid OpenZeppelin's `TransparentUpgradeableProxy`
        // reverting on successful calls, which is likely occurring because its `upgradeToAndCall`
        // function doesn't return any data.
        (bool success, ) = _proxy.call(
            abi.encodeCall(
                Proxy.upgradeToAndCall,
                (
                    Proxy(_proxy).implementation(),
                    abi.encodeCall(IProxyUpdater.setStorage, (_key, _value))
                )
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
