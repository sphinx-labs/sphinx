// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Fallback {
    int public number;
    string public myString;

    constructor (int _number) {
        number = _number;
    }

    fallback() external {
        myString = "did fallback";
    }

    function set(int _number) external {
        number = _number;
    }
}
