// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgOverrides {
    int public immutable intArg;
    uint public immutable uintArg;
    address public immutable addressArg;
    address public immutable defaultAndIncorrectOverrideArg;

    constructor(
        int _intArg,
        uint _uintArg,
        address _addressArg,
        address _defaultAndIncorrectOverrideArg
    ) {
        intArg = _intArg;
        uintArg = _uintArg;
        addressArg = _addressArg;
        defaultAndIncorrectOverrideArg = _defaultAndIncorrectOverrideArg;
    }
}
