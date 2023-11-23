// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SimpleStorage } from "./SimpleStorage.sol";

library Types {
    enum TestEnum {
        A,
        B,
        C
    }

    type UserDefinedType is uint256;
    type UserDefinedBytes32 is bytes32;
    type UserDefinedInt is int256;
    type UserDefinedInt8 is int8;
    type UserDefinedUint8 is uint8;
    type UserDefinedBool is bool;
}

contract Storage {
    struct SimpleStruct {
        bytes32 a;
        uint128 b;
        uint128 c;
    }

    struct ComplexStruct {
        int32 a;
        mapping(uint32 => string) b;
        Types.UserDefinedType c;
    }

    int256 public immutable immutableInt;
    int8 public immutable immutableInt8;
    uint256 public immutable immutableUint;
    uint8 public immutable immutableUint8;
    bool public immutable immutableBool;
    bytes32 public immutable immutableBytes32;

    constructor(
        int256 _immutableInt,
        int8 _immutableInt8,
        uint256 _immutableUint,
        uint8 _immutableUint8,
        bool _immutableBool,
        bytes32 _immutableBytes32
    ) {
        immutableInt = _immutableInt;
        immutableInt8 = _immutableInt8;
        immutableUint = _immutableUint;
        immutableUint8 = _immutableUint8;
        immutableBool = _immutableBool;
        immutableBytes32 = _immutableBytes32;
    }

    function(uint256) internal pure returns (uint256) internalFunc;
    int8 public minInt8;
    function(uint256) external pure returns (uint256) externalFunc;
    int256 public minInt256;
    int256 public bigNumberInt256;
    int8 public bigNumberInt8;
    uint256 public bigNumberUint256;
    uint8 public bigNumberUint8;
    uint8 public uint8Test;
    bool public boolTest;
    string public stringTest;
    string public longStringTest;
    bytes public bytesTest;
    bytes public longBytesTest;
    bytes32 public bytes32Test;
    address public addressTest;
    address payable public payableAddressTest;
    Types.UserDefinedType public userDefinedTypeTest;
    Types.UserDefinedBytes32 public userDefinedBytesTest;
    Types.UserDefinedInt public userDefinedInt;
    Types.UserDefinedInt8 public userDefinedInt8;
    Types.UserDefinedUint8 public userDefinedUint8;
    Types.UserDefinedBool public userDefinedBool;
    Types.UserDefinedInt public userDefinedBigNumberInt;
    mapping(Types.UserDefinedType => string) public userDefinedToStringMapping;
    mapping(string => Types.UserDefinedType) public stringToUserDefinedMapping;
    Types.UserDefinedType[2] public userDefinedFixedArray;
    Types.UserDefinedType[2][2] public userDefinedFixedNestedArray;
    Types.UserDefinedType[] public userDefinedDynamicArray;
    Storage public contractTest;
    Types.TestEnum public enumTest;
    Types.TestEnum public bigNumberEnumTest;
    SimpleStruct public simpleStruct;
    ComplexStruct public complexStruct;
    uint64[5] public uint64FixedArray;
    uint64[5] public mixedTypesUint64FixedArray;
    uint128[5][6] public uint128FixedNestedArray;
    uint64[2][2][2] public uint64FixedMultiNestedArray;
    int64[] public int64DynamicArray;
    int64[][] public int64NestedDynamicArray;
    SimpleStruct[] public simpleStructDynamicArray;
    mapping(string => string) public stringToStringMapping;
    mapping(string => string) public longStringToLongStringMapping;
    mapping(string => uint256) public stringToUint256Mapping;
    mapping(string => bool) public stringToBoolMapping;
    mapping(string => address) public stringToAddressMapping;
    mapping(string => SimpleStruct) public stringToStructMapping;
    mapping(string => uint256) public stringToBigNumberUintMapping;
    mapping(uint256 => string) public uint256ToStringMapping;
    mapping(uint8 => string) public uint8ToStringMapping;
    mapping(uint128 => string) public uint128ToStringMapping;
    mapping(int256 => string) public int256ToStringMapping;
    mapping(int8 => string) public int8ToStringMapping;
    mapping(int128 => string) public int128ToStringMapping;
    mapping(address => string) public addressToStringMapping;
    mapping(SimpleStorage => string) public contractToStringMapping;
    mapping(Types.TestEnum => string) public enumToStringMapping;
    mapping(bytes => string) public bytesToStringMapping;
    mapping(string => mapping(string => string)) public nestedMapping;
    mapping(uint8 => mapping(string => mapping(address => uint256))) public multiNestedMapping;

    function getComplexStructMappingVal(uint32 _mappingKey) external view returns (string memory) {
        return complexStruct.b[_mappingKey];
    }
}

contract OtherImmutables {
    Types.UserDefinedType public immutable immutableUserDefinedType;
    uint256 public immutable immutableBigNumberUint;
    int256 public immutable immutableBigNumberInt;
    address public immutable immutableAddress;
    Storage public immutable immutableContract;
    Types.TestEnum public immutable immutableEnum;

    constructor(
        Types.UserDefinedType _immutableUserDefinedType,
        uint256 _immutableBigNumberUint,
        int256 _immutableBigNumberInt,
        address _immutableAddress,
        Storage _immutableContract,
        Types.TestEnum _immutableEnum
    ) {
        immutableUserDefinedType = _immutableUserDefinedType;
        immutableBigNumberUint = _immutableBigNumberUint;
        immutableBigNumberInt = _immutableBigNumberInt;
        immutableAddress = _immutableAddress;
        immutableContract = _immutableContract;
        immutableEnum = _immutableEnum;
    }
}
