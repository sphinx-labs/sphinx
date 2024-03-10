// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Owned {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }
}
