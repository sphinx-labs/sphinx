// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract MockChugSplashRegistry {
    address public immutable managerImplementation;

    constructor(address _managerImplementation) {
        managerImplementation = _managerImplementation;
    }
}
