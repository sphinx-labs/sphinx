// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract MyContract2 {
    uint public number;

    function incrementMyContract2(uint _num) external {
        number += _num;
    }
}
