// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "hardhat/console.sol";

contract HelloChugSplash {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;

    constructor() {
        revert('Hello');
    }
}

contract Deployer {
    function deploy() external {
        try new HelloChugSplash() {

        } catch Error(string memory reason) {
            console.log(reason);
        }
    }
}
