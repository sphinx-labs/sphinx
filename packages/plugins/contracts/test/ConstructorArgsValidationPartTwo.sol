// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgsValidationPartTwo {
    struct SimpleStruct { uint a; uint b; }

    bytes8 immutable public longBytes8;
    bytes16 immutable public malformedBytes16;
    bool immutable public intBoolean;
    bool immutable public stringBoolean;
    bool immutable public arrayBoolean;
    uint[] public invalidBaseTypeArray;
    uint[][] public invalidNestedBaseTypeArray;
    uint[2] public incorrectlySizedArray;
    uint[2][2] public incorrectlySizedNestedArray;
    SimpleStruct public structMissingMembers;

    constructor(
        bytes8 _longBytes8,
        bytes16 _malformedBytes16,
        bool _intBoolean,
        bool _stringBoolean,
        bool _arrayBoolean,
        uint[] memory _invalidBaseTypeArray,
        uint[][] memory _invalidNestedBaseTypeArray,
        uint[2] memory _incorrectlySizedArray,
        uint[2][2] memory _incorrectlySizedNestedArray,
        SimpleStruct memory _structMissingMembers
    ) {
        longBytes8 = _longBytes8;
        malformedBytes16 = _malformedBytes16;
        intBoolean = _intBoolean;
        stringBoolean = _stringBoolean;
        arrayBoolean = _arrayBoolean;
        invalidBaseTypeArray = _invalidBaseTypeArray;
        invalidNestedBaseTypeArray = _invalidNestedBaseTypeArray;
        incorrectlySizedArray = _incorrectlySizedArray;
        incorrectlySizedNestedArray = _incorrectlySizedNestedArray;
        structMissingMembers = _structMissingMembers;
    }
}
