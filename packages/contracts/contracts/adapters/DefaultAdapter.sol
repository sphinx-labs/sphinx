// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "../interfaces/IProxyUpdater.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";

/**
 * @title DefaultAdapter
 * @notice Adapter for the default EIP-1967 proxy used by ChugSplash.
 */
contract DefaultAdapter is IProxyAdapter {
    /**
     * @notice Address of the ProxyUpdater contract that will be set as the proxy's implementation
    during the deployment.
     */
    address public immutable proxyUpdater;

    /**
     * @param _proxyUpdater Address of the ProxyUpdater contract.
     */
    constructor(address _proxyUpdater) {
        require(_proxyUpdater != address(0), "DefaultAdapter: updater cannot be address(0)");
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
        IProxyUpdater(_proxy).setStorage(_key, _offset, _value);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
