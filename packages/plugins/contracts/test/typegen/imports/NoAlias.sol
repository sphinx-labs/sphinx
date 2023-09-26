// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { MyTypeLibrary } from "./Types.sol";
import { MyTypeContract } from "./Types.sol";
import { MyTopLevelType, MyTopLevelStruct, MyTopLevelEnum } from "./Types.sol";

type MyLocalType is int8;

struct MyLocalStruct {
    int8 a;
}

enum MyLocalEnum {
    This,
    Enum,
    Is,
    Local
}

contract NoAliasImportsOne {
    MyTypeLibrary.MyEnumInLibrary public libraryEnum;
    MyTypeLibrary.MyStructInLibrary public libraryStruct;
    MyTypeLibrary.MyTypeInLibrary public libraryType;

    MyTypeContract.MyEnumInContract public contractEnum;
    MyTypeContract.MyStructInContract public contractStruct;
    MyTypeContract.MyTypeInContract public contractType;

    constructor(
        MyTypeLibrary.MyEnumInLibrary _libraryEnum,
        MyTypeLibrary.MyStructInLibrary memory _libraryStruct,
        MyTypeLibrary.MyTypeInLibrary _libraryType,
        MyTypeContract.MyEnumInContract _contractEnum,
        MyTypeContract.MyStructInContract memory _contractStruct,
        MyTypeContract.MyTypeInContract _contractType
    ) {
        libraryEnum = _libraryEnum;
        libraryStruct = _libraryStruct;
        libraryType = _libraryType;
        contractEnum = _contractEnum;
        contractStruct = _contractStruct;
        contractType = _contractType;
    }
}

contract NoAliasImportsTwo {
    MyTopLevelEnum public topLevelEnum;
    MyTopLevelStruct public topLevelStruct;
    MyTopLevelType public topLevelType;

    MyLocalEnum public localEnum;
    MyLocalStruct public localStruct;
    MyLocalType public localType;

    constructor(
        MyTopLevelEnum _topLevelEnum,
        MyTopLevelStruct memory _topLevelStruct,
        MyTopLevelType _topLevelType,
        MyLocalEnum _localEnum,
        MyLocalStruct memory _localStruct,
        MyLocalType _localType
    ) {
        topLevelEnum = _topLevelEnum;
        topLevelStruct = _topLevelStruct;
        topLevelType = _topLevelType;
        localEnum = _localEnum;
        localStruct = _localStruct;
        localType = _localType;
    }
}

