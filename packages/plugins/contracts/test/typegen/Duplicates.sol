// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct MyNestedStruct {
    uint8 d;
}

struct MyStruct {
    string a;
    bytes32 b;
    MyNestedStruct c;
}

struct TopLevelStruct {
    string value;
}

contract MyEdgeCasesDuplicate {
    enum TestEnum {
        Different,
        Values
    }

    type UserDefinedType is bytes32;

    MyStruct public myStruct;
    MyNestedStruct public myNestedStruct;
    TestEnum public myEnum;
    UserDefinedType public userDefinedType;
    TopLevelStruct public topLevelStruct;

    constructor(
        MyStruct memory _myStruct,
        MyNestedStruct memory _myNestedStruct,
        TestEnum _myEnum,
        UserDefinedType _userDefinedType,
        TopLevelStruct memory _topLevelStruct
    ) {
        myStruct = _myStruct;
        myNestedStruct = _myNestedStruct;
        myEnum = _myEnum;
        userDefinedType = _userDefinedType;
        topLevelStruct = _topLevelStruct;
    }
}
