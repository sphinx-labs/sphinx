// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ManagedService
 * @notice Contract controlled by the ChugSplash managed service. This contract allows the managed
   service to remotely execute deployments, propose deployments, and collect the protocol's fee.
Users can opt in to this functionality if they choose to do so.
 */
contract ManagedService is AccessControl {
    /**
     * @param _owner The address that will be granted the `DEFAULT_ADMIN_ROLE`. This address is the
       multisig owned by the ChugSplash team.
     */
    constructor(address _owner) {
        _grantRole(bytes32(0), _owner);
    }
}
