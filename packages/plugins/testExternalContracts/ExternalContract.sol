// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract ExternalContract {
    uint public number;

    constructor(uint _number) {
        number = _number;
    }

    function setNumber(uint _number) external {
        number = _number;
    }
}
