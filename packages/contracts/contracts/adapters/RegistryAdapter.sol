// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "../interfaces/IProxyUpdater.sol";
import { Proxy } from "../libraries/Proxy.sol";
import { ChugSplashRegistryProxy } from "../ChugSplashRegistryProxy.sol";


/**
 * @title RegistryAdapter
 * @notice Adapter for the ChugSplashRegistry. Will be removed once ChugSplash is non-upgradeable.
 */
contract RegistryAdapter is IProxyAdapter {
    address public immutable proxyUpdater;

    constructor(address _proxyUpdater) {
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateExecution(address payable _proxy) external {
        Proxy(_proxy).upgradeTo(proxyUpdater);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function completeExecution(address payable _proxy, address _implementation, bytes memory _extraData) external {
        ChugSplashRegistryProxy(_proxy).upgradeTo(_implementation);

        address managerImpl;
        assembly {
            managerImpl := mload(add(_extraData, 20))
        }
        ChugSplashRegistryProxy(_proxy).setManagerImpl(managerImpl);
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
        IProxyUpdater(_proxy).setStorage(_key, _offset, _segment);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
