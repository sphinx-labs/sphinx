// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgsValidationPartOne {
    bytes32 immutable public immutableBytes;
    int8 immutable public arrayInt8;
    int8 immutable public int8OutsideRange;
    uint8 immutable public uint8OutsideRange;
    address immutable public intAddress;
    address immutable public arrayAddress;
    address immutable public shortAddress;
    bytes32 immutable public intBytes32;
    bytes32 immutable public arrayBytes32;
    bytes32 immutable public shortBytes32;
    bytes32 immutable public oddStaticBytes;

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
