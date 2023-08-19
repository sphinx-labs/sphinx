// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgOverrides {
    int public immutable intArg;
    uint public immutable uintArg;
    address public immutable addressArg;

    constructor(
        int _intArg,
        uint _uintArg,
        address _intAddress
    ) {
        intArg = _intArg;
        uintArg = _uintArg;
        addressArg = _intAddress;
    }
}
