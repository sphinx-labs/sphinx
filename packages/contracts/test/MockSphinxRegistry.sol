// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract MockSphinxRegistry {
    address public immutable managerImplementation;

    constructor(address _managerImplementation) {
        managerImplementation = _managerImplementation;
    }
}
