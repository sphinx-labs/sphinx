// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { OZUUPSBaseAdapter } from "./OZUUPSBaseAdapter.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";

/**
 * @title OZUUPSAccessControlAdapter
 * @notice Adapter for an OpenZeppelin UUPS Upgradeable proxy using AccessControl authorization.
 *         Inherits from the OZUUPSBaseAdapter which implements the main uups adapter functionality.
 *
 *         To learn more about the transparent proxy pattern, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups
 *
 *         To learn more about AccessControl, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/access#AccessControl
 */
contract OZUUPSAccessControlAdapter is IProxyAdapter, OZUUPSBaseAdapter {
    constructor(address _proxyUpdater) OZUUPSBaseAdapter(_proxyUpdater) {}

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        AccessControl(_proxy).grantRole(0x00, _newAdmin);
    }
}
