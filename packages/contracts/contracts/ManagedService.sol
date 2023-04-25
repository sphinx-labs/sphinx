// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract ManagedService is AccessControl {
    bytes32 public constant CALLER_ROLE = keccak256("CALLER_ROLE");

    event ExecutedCall(address indexed from, address indexed to, uint256 value);

    constructor(address _owner) {
        _grantRole(bytes32(0), _owner);
    }

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
