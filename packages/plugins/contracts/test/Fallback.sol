// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Fallback {
    int256 public number;
    string public myString;

    constructor(int256 _number) {
        number = _number;
    }

    fallback() external {
        myString = "did fallback";
    }

    function set(int256 _number) external {
        number = _number;
    }
}
