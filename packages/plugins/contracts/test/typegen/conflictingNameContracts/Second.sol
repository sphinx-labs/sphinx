// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConflictingNameContract {
    address public addr;

    constructor(address _addr) {
        addr = _addr;
    }
}
