// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VariableValidation {
    struct SimpleStruct {
        uint256 a;
        uint256 b;
    }

    int8 public arrayInt8;
    int8 public int8OutsideRange;
    uint8 public uint8OutsideRange;
    address public intAddress;
    address public arrayAddress;
    address public shortAddress;
    bytes32 public intBytes32;
    bytes32 public arrayBytes32;
    bytes32 public shortBytes32;
    bytes8 public longBytes8;
    bytes16 public malformedBytes16;
    bytes8 public oddStaticBytes;
    bytes public oddDynamicBytes;
    bool public intBoolean;
    bool public stringBoolean;
    bool public arrayBoolean;
    int8[2] public oversizedArray;
    int8[2][2] public oversizedNestedArray;
    bool[2] public invalidBoolArray;
    bytes32[2] public invalidBytes32Array;
    address[2] public invalidAddressArray;
    mapping(string => string) public invalidStringStringMapping;
    mapping(string => int256) public invalidStringIntMapping;
    mapping(string => mapping(string => int256)) public invalidNestedStringIntBoolMapping;
    SimpleStruct public extraMemberStruct;
    SimpleStruct public missingMemberStruct;

    // Variables that are not set in the config
    uint256 public notSetUint;
    string public notSetString;

    // Variables that should not be set in the config (but are)
    function(uint256) internal pure returns (uint256) functionType;
}
