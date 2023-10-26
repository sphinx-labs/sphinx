// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConstructorArgsValidationPartOne {
    bytes32 public immutable immutableBytes;
    int8 public immutable arrayInt8;
    int8 public immutable int8OutsideRange;
    uint8 public immutable uint8OutsideRange;
    address public immutable intAddress;
    address public immutable arrayAddress;
    address public immutable shortAddress;
    bytes32 public immutable intBytes32;
    bytes32 public immutable arrayBytes32;
    bytes32 public immutable shortBytes32;
    bytes32 public immutable oddStaticBytes;

    constructor(
        bytes32 _immutableBytes,
        int8 _arrayInt8,
        int8 _int8OutsideRange,
        uint8 _uint8OutsideRange,
        address _intAddress,
        address _arrayAddress,
        address _shortAddress,
        bytes32 _intBytes32,
        bytes32 _arrayBytes32,
        bytes32 _shortBytes32,
        bytes32 _oddStaticBytes
    ) {
        immutableBytes = _immutableBytes;
        arrayInt8 = _arrayInt8;
        int8OutsideRange = _int8OutsideRange;
        uint8OutsideRange = _uint8OutsideRange;
        intAddress = _intAddress;
        arrayAddress = _arrayAddress;
        shortAddress = _shortAddress;
        intBytes32 = _intBytes32;
        arrayBytes32 = _arrayBytes32;
        shortBytes32 = _shortBytes32;
        oddStaticBytes = _oddStaticBytes;
    }
}
