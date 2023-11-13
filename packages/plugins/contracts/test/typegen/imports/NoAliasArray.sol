// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {MyTypeLibrary} from "./Types.sol";
import {MyTypeContract} from "./Types.sol";
import {MyTopLevelType, MyTopLevelStruct, MyTopLevelEnum} from "./Types.sol";

type MyLocalTypeArray is int8;

struct MyLocalStructArray {
    int8 a;
}

enum MyLocalEnumArray {
    This,
    Enum,
    Is,
    Local
}

contract NoAliasArrayImportsOne {
    MyTypeLibrary.MyEnumInLibrary[] public libraryEnum;
    MyTypeLibrary.MyStructInLibrary[] public libraryStruct;
    MyTypeLibrary.MyTypeInLibrary[] public libraryType;

    MyTypeContract.MyEnumInContract[] public contractEnum;
    MyTypeContract.MyStructInContract[] public contractStruct;
    MyTypeContract.MyTypeInContract[] public contractType;

    constructor(
        MyTypeLibrary.MyEnumInLibrary[] memory _libraryEnum,
        MyTypeLibrary.MyStructInLibrary[] memory _libraryStruct,
        MyTypeLibrary.MyTypeInLibrary[] memory _libraryType,
        MyTypeContract.MyEnumInContract[] memory _contractEnum,
        MyTypeContract.MyStructInContract[] memory _contractStruct,
        MyTypeContract.MyTypeInContract[] memory _contractType
    ) {
        libraryEnum.push(_libraryEnum[0]);
        libraryStruct.push(_libraryStruct[0]);
        libraryType.push(_libraryType[0]);
        contractEnum.push(_contractEnum[0]);
        contractStruct.push(_contractStruct[0]);
        contractType.push(_contractType[0]);
    }
}

contract NoAliasArrayImportsTwo {
    MyTopLevelEnum[] public topLevelEnum;
    MyTopLevelStruct[] public topLevelStruct;
    MyTopLevelType[] public topLevelType;

    MyLocalEnumArray[] public localEnum;
    MyLocalStructArray[] public localStruct;
    MyLocalTypeArray[] public localType;

    constructor(
        MyTopLevelEnum[] memory _topLevelEnum,
        MyTopLevelStruct[] memory _topLevelStruct,
        MyTopLevelType[] memory _topLevelType,
        MyLocalEnumArray[] memory _localEnum,
        MyLocalStructArray[] memory _localStruct,
        MyLocalTypeArray[] memory _localType
    ) {
        topLevelEnum.push(_topLevelEnum[0]);
        topLevelStruct.push(_topLevelStruct[0]);
        topLevelType.push(_topLevelType[0]);
        localEnum.push(_localEnum[0]);
        localStruct.push(_localStruct[0]);
        localType.push(_localType[0]);
    }
}
