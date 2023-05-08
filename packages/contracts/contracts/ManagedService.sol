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
    bytes32 public constant CALLER_ROLE = keccak256("CALLER_ROLE");

    event ExecutedCall(address indexed from, address indexed to, uint256 value);

    /**
     * @param _owner The address that will be granted the `DEFAULT_ADMIN_ROLE`. This address is the
       multisig owned by the ChugSplash team.
     */
    constructor(address _owner) {
        _grantRole(bytes32(0), _owner);
    }

    /**
     * @notice Executes an arbitrary call to any contract. This is primarily used to claim
     *         organizations on behalf of users.
     * @param _to Address of target contract.
     * @param _data The calldata.
     */
    function executeCall(
        address _to,
        bytes memory _data
    ) external payable onlyRole(CALLER_ROLE) returns (bytes memory) {
        emit ExecutedCall(msg.sender, _to, msg.value);
        (bool success, bytes memory returnData) = _to.call{ value: msg.value }(_data);
        require(success, "PermissionedCaller: call failed");
        return returnData;
    }
}
