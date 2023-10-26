// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./LocalParent.sol";

contract ChildParentImportsTypes is LocalParentTypes {
    constructor(
        MyLocalTypeLibrary.MyEnumInLibrary _libraryEnum,
        MyLocalTypeLibrary.MyStructInLibrary memory _libraryStruct,
        MyLocalTypeLibrary.MyTypeInLibrary _libraryType,
        MyLocalTypeContract.MyEnumInContract _contractEnum,
        MyLocalTypeContract.MyStructInContract memory _contractStruct,
        MyLocalTypeContract.MyTypeInContract _contractType
    )
        LocalParentTypes(
            _libraryEnum,
            _libraryStruct,
            _libraryType,
            _contractEnum,
            _contractStruct,
            _contractType
        )
    {}

    function updateValues(
        MyLocalTypeLibrary.MyEnumInLibrary _libraryEnum,
        MyLocalTypeLibrary.MyStructInLibrary memory _libraryStruct,
        MyLocalTypeLibrary.MyTypeInLibrary _libraryType,
        MyLocalTypeContract.MyEnumInContract _contractEnum,
        MyLocalTypeContract.MyStructInContract memory _contractStruct,
        MyLocalTypeContract.MyTypeInContract _contractType
    ) public {
        libraryEnum = _libraryEnum;
        libraryStruct = _libraryStruct;
        libraryType = _libraryType;
        contractEnum = _contractEnum;
        contractStruct = _contractStruct;
        contractType = _contractType;
    }
}
