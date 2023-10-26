// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UnnamedParameters {
    uint public number;

    constructor(uint256 myNumber, uint256) {
        number = myNumber;
    }

    function increment(uint256, uint256 _value) public {
        number += _value;
    }
}
