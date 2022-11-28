// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract Storage {
    struct S { uint16 a; uint16 b; uint256 c; }

    int public minInt256;
    int8 public minInt8;
    uint8 public uint8Test;
    bool public boolTest;
    string public stringTest;
    S public structTest;
    mapping(string => string) public stringToStringMapping;
    mapping(string => uint) public stringToUint256Mapping;
    mapping(string => bool) public stringToBoolMapping;
    mapping(string => address) public stringToAddressMapping;
    mapping(string => S) public stringToStructMapping;
    mapping(uint => string) public uint256ToStringMapping;
    mapping(uint8 => string) public uint8ToStringMapping;
    mapping(uint128 => string) public uint128ToStringMapping;
    mapping(int => string) public int256ToStringMapping;
    mapping(int8 => string) public int8ToStringMapping;
    mapping(int128 => string) public int128ToStringMapping;
    mapping(address => string) public addressToStringMapping;
    mapping(bytes => string) public bytesToStringMapping;
    mapping(string => mapping(string => string)) public nestedMapping;
    mapping(uint8 => mapping(string => mapping(address => uint))) public multiNestedMapping;
}
