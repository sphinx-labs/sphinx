// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract Stateless {
    uint immutable public immutableUint;

    constructor(uint _immutableUint) {
        immutableUint = _immutableUint;
    }

    function hello() pure external returns (string memory) {
        return 'Hello, world!';
    }
}
