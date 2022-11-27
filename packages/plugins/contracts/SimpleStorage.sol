// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract SimpleStorage {
    struct S { uint16 a; uint16 b; uint256 c; }
    int internal testInt;
    uint8 internal number;
    bool internal stored;
    string internal storageName;
    S testStruct;
    mapping(string => string) public strTest;
    mapping(string => uint) public uintTest;
    mapping(string => bool) public boolTest;
    mapping(string => address) public addressTest;

    mapping(uint => string) public uintStrTest;
    mapping(int => string) public intStrTest;
    mapping(int8 => string) public int8StrTest;
    mapping(int128 => string) public int128StrTest;
    mapping(uint8 => string) public uint8StrTest;
    mapping(uint128 => string) public uint128StrTest;
    mapping(address => string) public addressStrTest;
    mapping(bytes => string) public bytesStrTest;
    mapping(string => S) structTest;
    mapping(string => mapping(string => string)) public nestedMappingTest;
    mapping(uint8 => mapping(string => mapping(address => uint))) public multiNestedMapping;

    function getTestInt() external view returns (int) {
        return testInt;
    }

    function getNumber() external view returns (uint8) {
        return number;
    }

    function isStored() external view returns (bool) {
        return stored;
    }

    function getStorageName() external view returns (string memory) {
        return storageName;
    }

    function getStruct() external view returns (S memory) {
        return testStruct;
    }

    function getStringTestMappingValue(string memory key) external view returns (string memory) {
        return strTest[key];
    }

    function getIntTestMappingValue(string memory key) external view returns (uint) {
        return uintTest[key];
    }

    function getBoolTestMappingValue(string memory key) external view returns (bool) {
        return boolTest[key];
    }

    function getAddressTestMappingValue(string memory key) external view returns (address) {
        return addressTest[key];
    }

    function getStructTestMappingValue(string memory key) external view returns (S memory) {
        return structTest[key];
    }

    function getUintStringTestMappingValue(uint key) external view returns (string memory) {
        return uintStrTest[key];
    }

    function getIntStringTestMappingValue(int key) external view returns (string memory) {
        return intStrTest[key];
    }

    function getInt8StringTestMappingValue(int8 key) external view returns (string memory) {
        return int8StrTest[key];
    }

    function getInt128StringTestMappingValue(int128 key) external view returns (string memory) {
        return int128StrTest[key];
    }

    function getUint8StringTestMappingValue(uint8 key) external view returns (string memory) {
        return uint8StrTest[key];
    }

    function getUint128StringTestMappingValue(uint128 key) external view returns (string memory) {
        return uint128StrTest[key];
    }

    function getAddressStringTestMappingValue(address key) external view returns (string memory) {
        return addressStrTest[key];
    }

    function getBytesStringTestMappingValue(bytes memory key) external view returns (string memory) {
        return bytesStrTest[key];
    }

    function getNestedTestMappingValue(string memory keyOne, string memory keyTwo) external view returns (string memory) {
        return nestedMappingTest[keyOne][keyTwo];
    }

    function getMultiNestedMappingTestMappingValue(uint8 keyOne, string memory keyTwo, address keyThree) external view returns (uint) {
        return multiNestedMapping[keyOne][keyTwo][keyThree];
    }
}
