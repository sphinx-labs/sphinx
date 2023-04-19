// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgsValidationPartTwo {
    bytes8 immutable public longBytes8;
    bytes16 immutable public malformedBytes16;
    bool immutable public intBoolean;
    bool immutable public stringBoolean;
    bool immutable public arrayBoolean;

    constructor(
        bytes8 _longBytes8,
        bytes16 _malformedBytes16,
        bool _intBoolean,
        bool _stringBoolean,
        bool _arrayBoolean
    ) {
        longBytes8 = _longBytes8;
        malformedBytes16 = _malformedBytes16;
        intBoolean = _intBoolean;
        stringBoolean = _stringBoolean;
        arrayBoolean = _arrayBoolean;
    }
}
