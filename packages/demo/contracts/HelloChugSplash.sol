// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "hardhat/console.sol";

contract HelloChugSplash {
    mapping(uint => mapping(uint => uint8)) public n;

    function setNum() external {
        n[1][2] = 3;
        n[1][1] = 4;
        console.log(n[1][2]);
        console.log(n[1][1]);
    }
}
