// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract Storage {
    type UserDefinedType is uint256;
    type UserDefinedBytes32 is bytes32;
    type UserDefinedInt is int;
    type UserDefinedInt8 is int8;
    type UserDefinedUint8 is uint8;
    type UserDefinedBool is bool;

    enum TestEnum { A, B, C }
    struct SimpleStruct { bytes32 a; uint128 b; uint128 c; }
    struct ComplexStruct {
        int32 a;
        mapping(uint32 => string) b;
        UserDefinedType c;
    }

    int immutable public immutableInt;
    int8 immutable public immutableInt8;
    uint immutable public immutableUint;
    uint8 immutable public immutableUint8;
    bool immutable public immutableBool;
    bytes32 immutable public immutableBytes32;
    UserDefinedType immutable public immutableUserDefinedType;
    uint immutable public immutableBigNumberUint;
    int immutable public immutableBigNumberInt;
    address immutable public immutableAddress;
    Storage immutable public immutableContract;
    TestEnum immutable public immutableEnum;

    constructor(
        int _immutableInt,
        int8 _immutableInt8,
        uint _immutableUint,
        uint8 _immutableUint8,
        bool _immutableBool,
        bytes32 _immutableBytes32,
        UserDefinedType _immutableUserDefinedType,
        uint _immutableBigNumberUint,
        int _immutableBigNumberInt,
        address _immutableAddress,
        Storage _immutableContract,
        TestEnum _immutableEnum
    ) {
        immutableInt = _immutableInt;
        immutableInt8 = _immutableInt8;
        immutableUint = _immutableUint;
        immutableUint8 = _immutableUint8;
        immutableBool = _immutableBool;
        immutableBytes32 = _immutableBytes32;
        immutableUserDefinedType = _immutableUserDefinedType;
        immutableBigNumberUint = _immutableBigNumberUint;
        immutableBigNumberInt = _immutableBigNumberInt;
        immutableAddress = _immutableAddress;
        immutableContract = _immutableContract;
        immutableEnum = _immutableEnum;
    }

    function(uint256) pure internal returns (uint256) internalFunc;
    int8 public minInt8;
    function(uint256) pure external returns (uint256) externalFunc;
    int public minInt256;
    int public bigNumberInt256;
    int8 public bigNumberInt8;
    uint public bigNumberUint256;
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
    UserDefinedType public userDefinedTypeTest;
    UserDefinedBytes32 public userDefinedBytesTest;
    UserDefinedInt public userDefinedInt;
    UserDefinedInt8 public userDefinedInt8;
    UserDefinedUint8 public userDefinedUint8;
    UserDefinedBool public userDefinedBool;
    UserDefinedInt public userDefinedBigNumberInt;
    mapping(UserDefinedType => string) public userDefinedToStringMapping;
    mapping(string => UserDefinedType) public stringToUserDefinedMapping;
    UserDefinedType[2] public userDefinedFixedArray;
    UserDefinedType[2][2] public userDefinedFixedNestedArray;
    UserDefinedType[] public userDefinedDynamicArray;
    Storage public contractTest;
    TestEnum public enumTest;
    TestEnum public bigNumberEnumTest;
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
    mapping(string => uint) public stringToUint256Mapping;
    mapping(string => bool) public stringToBoolMapping;
    mapping(string => address) public stringToAddressMapping;
    mapping(string => SimpleStruct) public stringToStructMapping;
    mapping(string => uint) public stringToBigNumberUintMapping;
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

    function getComplexStructMappingVal(uint32 _mappingKey) external view returns (string memory) {
        return complexStruct.b[_mappingKey];
    }
}
