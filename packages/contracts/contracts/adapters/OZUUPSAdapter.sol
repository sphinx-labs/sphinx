// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { OZUUPSUpdater } from "../updaters/OZUUPSUpdater.sol";
import { Proxy } from "../libraries/Proxy.sol";

import "hardhat/console.sol";

/**
 * @title UUPSAdapter
 * @notice Adapter for an OpenZeppelin UUPS Upgradeable proxy. To learn more about the transparent
 *         proxy pattern, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups
 */
contract OZUUPSAdapter is IProxyAdapter {

    address public immutable proxyUpdater;

    constructor(address _proxyUpdater) {
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateExecution(address payable _proxy) external {
        console.log('entered transparent');
        OZUUPSUpdater(_proxy).upgradeTo(proxyUpdater);
        OZUUPSUpdater(_proxy).initiate();
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function completeExecution(address payable _proxy, address _implementation) external {
        OZUUPSUpdater(_proxy).complete(_implementation);
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
        OZUUPSUpdater(_proxy).setStorage(_key, _offset, _segment);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
