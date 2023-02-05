// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../IProxyAdapter.sol";
import { OZUUPSUpdater } from "../updaters/OZUUPSUpdater.sol";
import { Proxy } from "../libraries/Proxy.sol";

/**
 * @title UUPSAdapter
 * @notice Adapter for an OpenZeppelin UUPS Upgradeable proxy. To learn more about the transparent
 *         proxy pattern, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups
 */
contract OZUUPSAdapter is IProxyAdapter {
    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateExecution(address payable _proxy, address _implementation) external {
        OZUUPSUpdater(_proxy).upgradeTo(_implementation);
        OZUUPSUpdater(_proxy).setup();
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function completeExecution(address payable _proxy, address _implementation) external {
        OZUUPSUpdater(_proxy).teardown(_implementation);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function setStorage(address payable _proxy, bytes32 _key, bytes32 _value) external {
        OZUUPSUpdater(_proxy).setStorage(_key, _value);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
