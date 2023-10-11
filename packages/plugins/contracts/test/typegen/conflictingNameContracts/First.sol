// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConflictingNameContract {
    uint public number;

    constructor(uint _number) {
        number = _number;
    }
}
