// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";
import { OZUUPSUpdater } from "../updaters/OZUUPSUpdater.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";

/**
 * @title OZUUPSBaseAdapter
 * @notice Base adapter for an OpenZeppelin UUPS Upgradeable proxy.
 *         OZUUPSOwnableAdapter and OZUUPAccessControlAdapter both inherit from this contract
 *         and implement their respective mechanisms for users to reclaim ownership of proxies
 *         from the ChugSplash protocol.
 *
 *         To learn more about the uups proxy pattern, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups
 */
abstract contract OZUUPSBaseAdapter is IProxyAdapter {
    address public immutable proxyUpdater;

    constructor(address _proxyUpdater) {
        require(_proxyUpdater != address(0), "OZUUPSBaseAdapter: updater cannot be address(0)");
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function initiateExecution(address payable _proxy) external {
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
}
