// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConstructorArgsValidationPartTwo {
    struct SimpleStruct {
        uint256 a;
        uint256 b;
    }

    bytes8 public immutable longBytes8;
    bytes16 public immutable malformedBytes16;
    bool public immutable intBoolean;
    bool public immutable stringBoolean;
    bool public immutable arrayBoolean;
    uint256[] public invalidBaseTypeArray;
    uint256[][] public invalidNestedBaseTypeArray;
    uint256[2] public incorrectlySizedArray;
    uint256[2][2] public incorrectlySizedNestedArray;
    SimpleStruct public structMissingMembers;

    constructor(
        bytes8 _longBytes8,
        bytes16 _malformedBytes16,
        bool _intBoolean,
        bool _stringBoolean,
        bool _arrayBoolean,
        uint256[] memory _invalidBaseTypeArray,
        uint256[][] memory _invalidNestedBaseTypeArray,
        uint256[2] memory _incorrectlySizedArray,
        uint256[2][2] memory _incorrectlySizedNestedArray,
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
