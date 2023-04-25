// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { OZUUPSBaseAdapter } from "./OZUUPSBaseAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IProxyAdapter } from "../interfaces/IProxyAdapter.sol";

/**
 * @title OZUUPSOwnableAdapter
 * @notice Adapter for an OpenZeppelin UUPS Upgradeable proxy using Ownable authorization.
 *         Inherits from the OZUUPSBaseAdapter which implements the main uups adapter functionality.
 *
 *         To learn more about the uups proxy pattern, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups
 *
 *         To learn more about Ownable, see:
 *         https://docs.openzeppelin.com/contracts/2.x/api/ownership
 */
contract OZUUPSOwnableAdapter is IProxyAdapter, OZUUPSBaseAdapter {
    constructor(address _proxyUpdater) OZUUPSBaseAdapter(_proxyUpdater) {}

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Ownable(_proxy).transferOwnership(_newAdmin);
    }
}
