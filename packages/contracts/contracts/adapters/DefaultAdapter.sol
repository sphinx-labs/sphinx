// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../IProxyAdapter.sol";
import { Proxy } from "../libraries/Proxy.sol";

/**
 * @title DefaultAdapter
 * @notice Adapter for an OpenZeppelin Transparent Upgradeable proxy. This is the adapter used by
 *         default proxies in the ChugSplash system. To learn more about the transparent proxy
 *         pattern, see: https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent_proxy
 */
contract DefaultAdapter is IProxyAdapter {
    /**
     * @inheritdoc IProxyAdapter
     */
    function getProxyImplementation(address payable _proxy) external returns (address) {
        return Proxy(_proxy).implementation();
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function upgradeProxyTo(address payable _proxy, address _implementation) external {
        Proxy(_proxy).upgradeTo(_implementation);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
