// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { OZUUPSBaseAdapter } from "./OZUUPSBaseAdapter.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";

/**
 * @title OZUUPSAccessControlAdapter
 * @notice Proxy adapter for an OpenZeppelin UUPS proxy that uses AccessControl for its ownership
   mechanism.
 */
contract OZUUPSAccessControlAdapter is OZUUPSBaseAdapter {
    /**
     * @param _proxyUpdater Address of the ProxyUpdater contract.
     */
    constructor(address _proxyUpdater) OZUUPSBaseAdapter(_proxyUpdater) {}

    /**
     * Transfers ownership of the proxy using AccessControl.
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external override {
        AccessControl(_proxy).grantRole(0x00, _newAdmin);
    }
}
