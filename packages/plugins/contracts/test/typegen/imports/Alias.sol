// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {MyTypeLibrary as MyTypeLibraryAlias} from "./Types.sol";
import {MyTypeContract as MyTypeContractAlias} from "./Types.sol";
import {
    MyTopLevelType as MyTopLevelTypeAlias,
    MyTopLevelStruct as MyTopLevelStructAlias,
    MyTopLevelEnum as MyTopLevelEnumAlias
} from "./Types.sol";

contract AliasImports {
    MyTypeLibraryAlias.MyEnumInLibrary public libraryEnum;
    MyTypeLibraryAlias.MyStructInLibrary public libraryStruct;
    MyTypeLibraryAlias.MyTypeInLibrary public libraryType;

    MyTypeContractAlias.MyEnumInContract public contractEnum;
    MyTypeContractAlias.MyStructInContract public contractStruct;
    MyTypeContractAlias.MyTypeInContract public contractType;

    MyTopLevelEnumAlias public topLevelEnum;
    MyTopLevelStructAlias public topLevelStruct;
    MyTopLevelTypeAlias public topLevelType;

    constructor(
        MyTypeLibraryAlias.MyEnumInLibrary _libraryEnum,
        MyTypeLibraryAlias.MyStructInLibrary memory _libraryStruct,
        MyTypeLibraryAlias.MyTypeInLibrary _libraryType,
        MyTypeContractAlias.MyEnumInContract _contractEnum,
        MyTypeContractAlias.MyStructInContract memory _contractStruct,
        MyTypeContractAlias.MyTypeInContract _contractType,
        MyTopLevelEnumAlias _topLevelEnum,
        MyTopLevelStructAlias memory _topLevelStruct,
        MyTopLevelTypeAlias _topLevelType
    ) {
        libraryEnum = _libraryEnum;
        libraryStruct = _libraryStruct;
        libraryType = _libraryType;
        contractEnum = _contractEnum;
        contractStruct = _contractStruct;
        contractType = _contractType;
        topLevelEnum = _topLevelEnum;
        topLevelStruct = _topLevelStruct;
        topLevelType = _topLevelType;
    }
}
