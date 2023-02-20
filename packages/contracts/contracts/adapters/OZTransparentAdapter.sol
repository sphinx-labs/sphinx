// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "../interfaces/IProxyUpdater.sol";
import { Proxy } from "../libraries/Proxy.sol";

import "hardhat/console.sol";

/**
 * @title DefaultAdapter
 * @notice Adapter for an OpenZeppelin Transparent Upgradeable proxy. This is the adapter used by
 *         default proxies in the ChugSplash system. To learn more about the transparent proxy
 *         pattern, see: https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent_proxy
 */
contract OZTransparentAdapter is IProxyAdapter {

    address public immutable proxyUpdater;

    constructor(address _proxyUpdater) {
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateExecution(address payable _proxy) external {
        console.log('entered transparent');
        Proxy(_proxy).upgradeTo(proxyUpdater);
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
    function setStorage(
        address payable _proxy,
        bytes32 _key,
        uint8 _offset,
        bytes memory _segment
    ) external {
        console.log('setting transparent storage');
        // We perform a low-level call here to avoid OpenZeppelin's `TransparentUpgradeableProxy`
        // reverting on successful calls, which is likely occurring because its `upgradeToAndCall`
        // function doesn't return any data.
        (bool success, bytes memory retdata) = _proxy.call(
            abi.encodeCall(
                Proxy.upgradeToAndCall,
                (
                    proxyUpdater,
                    abi.encodeCall(IProxyUpdater.setStorage, (_key, _offset, _segment))
                )
            )
        );
        console.log('succeeded at transparenrt sstore: ', success);
        console.logBytes(retdata);
        require(success, "OZTransparentAdapter: call to set storage failed");
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
