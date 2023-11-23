// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConflictingNameContract {
    uint256 public number;

    constructor(uint256 _number) {
        number = _number;
    }

    function set(uint256 _number) public {
        number = _number;
    }
}
