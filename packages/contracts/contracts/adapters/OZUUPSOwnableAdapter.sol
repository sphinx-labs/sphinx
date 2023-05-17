// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { OZUUPSBaseAdapter } from "./OZUUPSBaseAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";

/**
 * @title OZUUPSOwnableAdapter
 * @notice Proxy adapter for an OpenZeppelin UUPS proxy that uses OwnableUpgradeable
    for access control.
 */
contract OZUUPSOwnableAdapter is OZUUPSBaseAdapter {
    /**
     * @param _proxyUpdater Address of the ProxyUpdater contract.
     */
    constructor(address _proxyUpdater) OZUUPSBaseAdapter(_proxyUpdater) {}

    /**
     * Transfers ownership of the proxy using the Ownable access control mechanism.
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external override {
        Ownable(_proxy).transferOwnership(_newAdmin);
    }
}
