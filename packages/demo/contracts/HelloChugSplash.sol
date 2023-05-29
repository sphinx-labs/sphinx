// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "hardhat/console.sol";

contract HelloChugSplash {

    bool public idk;

    function hi() external returns (uint) {
        return idk ? 2 : 1;
    }
}
