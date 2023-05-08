// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { OZUUPSUpdater } from "../updaters/OZUUPSUpdater.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";

/**
 * @title OZUUPSBaseAdapter
 * @notice An abstract proxy adapter for OpenZeppelin UUPS Upgradeable proxies. Child contracts must
           implement their own access control mechanism for the `changeProxyAdmin` function since
           UUPS proxies do not have a standard access control mechanism like Transparent proxies.
 */
abstract contract OZUUPSBaseAdapter is IProxyAdapter {
    /**
     * @notice Address of the ProxyUpdater contract that will be set as the OpenZeppelin UUPS
       proxy's implementation during the deployment.
     */
    address public immutable proxyUpdater;

    /**
     * @param _proxyUpdater Address of the ProxyUpdater contract.
     */
    constructor(address _proxyUpdater) {
        require(_proxyUpdater != address(0), "OZUUPSBaseAdapter: updater cannot be address(0)");
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateUpgrade(address payable _proxy) external {
        OZUUPSUpdater(_proxy).upgradeTo(proxyUpdater);
        OZUUPSUpdater(_proxy).initiate();
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function finalizeUpgrade(address payable _proxy, address _implementation) external {
        OZUUPSUpdater(_proxy).complete(_implementation);
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
        OZUUPSUpdater(_proxy).setStorage(_key, _offset, _value);
    }

    /**
        Must be overridden in child contracts in order to transfer ownership using the UUPS proxy's
        current acccess control mechanism (e.g. `Ownable.transferOwnership`).
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external virtual;
}
