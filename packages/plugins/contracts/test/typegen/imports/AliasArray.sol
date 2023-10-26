// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { MyTypeLibrary as MyTypeLibraryAlias } from "./Types.sol";
import { MyTypeContract as MyTypeContractAlias } from "./Types.sol";
import {
    MyTopLevelType as MyTopLevelTypeAlias,
    MyTopLevelStruct as MyTopLevelStructAlias,
    MyTopLevelEnum as MyTopLevelEnumAlias
} from "./Types.sol";

contract AliasImportsArray {
    MyTypeLibraryAlias.MyEnumInLibrary[] public libraryEnum;
    MyTypeLibraryAlias.MyStructInLibrary[] public libraryStruct;
    MyTypeLibraryAlias.MyTypeInLibrary[] public libraryType;

    MyTypeContractAlias.MyEnumInContract[] public contractEnum;
    MyTypeContractAlias.MyStructInContract[] public contractStruct;
    MyTypeContractAlias.MyTypeInContract[] public contractType;

    MyTopLevelEnumAlias[] public topLevelEnum;
    MyTopLevelStructAlias[] public topLevelStruct;
    MyTopLevelTypeAlias[] public topLevelType;

    constructor(
        MyTypeLibraryAlias.MyEnumInLibrary[] memory _libraryEnum,
        MyTypeLibraryAlias.MyStructInLibrary[] memory _libraryStruct,
        MyTypeLibraryAlias.MyTypeInLibrary[] memory _libraryType,
        MyTypeContractAlias.MyEnumInContract[] memory _contractEnum,
        MyTypeContractAlias.MyStructInContract[] memory _contractStruct,
        MyTypeContractAlias.MyTypeInContract[] memory _contractType,
        MyTopLevelEnumAlias[] memory _topLevelEnum,
        MyTopLevelStructAlias[] memory _topLevelStruct,
        MyTopLevelTypeAlias[] memory _topLevelType
    ) {
        libraryEnum.push(_libraryEnum[0]);
        libraryStruct.push(_libraryStruct[0]);
        libraryType.push(_libraryType[0]);
        contractEnum.push(_contractEnum[0]);
        contractStruct.push(_contractStruct[0]);
        contractType.push(_contractType[0]);
        topLevelEnum.push(_topLevelEnum[0]);
        topLevelStruct.push(_topLevelStruct[0]);
        topLevelType.push(_topLevelType[0]);
    }
}
