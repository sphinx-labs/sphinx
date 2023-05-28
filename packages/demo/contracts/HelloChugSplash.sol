// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "hardhat/console.sol";

contract HelloChugSplash {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;

    struct Hi {
        uint8 number;
        bool stored;
    }
    Hi hi;

    constructor() {
        hi = Hi(1, true);
        (uint a, bool b) = (hi.number, hi.stored);
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
