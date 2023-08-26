// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgs {
    int public immutable intArg;
    uint public immutable uintArg;
    address public immutable addressArg;
    address public immutable otherAddressArg;

    constructor(
        int _intArg,
        uint _uintArg,
        address _addressArg,
        address _otherAddressArg
    ) {
        intArg = _intArg;
        uintArg = _uintArg;
        addressArg = _addressArg;
        otherAddressArg = _otherAddressArg;
    }
}
