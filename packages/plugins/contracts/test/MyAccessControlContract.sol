// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract MyAccessControlContract is AccessControl {
    uint256 public myAccessControlValue;

    constructor(address _sphinxManager) {
        _setupRole(DEFAULT_ADMIN_ROLE, _sphinxManager);
    }

    function myAccessControlFunction(uint256 _value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        myAccessControlValue = _value;
    }
}

