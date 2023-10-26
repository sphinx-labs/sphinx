// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library MyLocalTypeLibrary {
    type MyTypeInLibrary is bool;

    struct MyStructInLibrary {
        bool a;
    }

    enum MyEnumInLibrary {
        Local,
        Enum,
        Library
    }
}

contract MyLocalTypeContract {
    type MyTypeInContract is bytes32;

    struct MyStructInContract {
        bytes32 a;
    }

    enum MyEnumInContract {
        Local,
        Enum,
        In,
        Contract
    }
}

contract LocalParentTypes {
    MyLocalTypeLibrary.MyEnumInLibrary public libraryEnum;
    MyLocalTypeLibrary.MyStructInLibrary public libraryStruct;
    MyLocalTypeLibrary.MyTypeInLibrary public libraryType;

    MyLocalTypeContract.MyEnumInContract public contractEnum;
    MyLocalTypeContract.MyStructInContract public contractStruct;
    MyLocalTypeContract.MyTypeInContract public contractType;

    constructor(
        MyLocalTypeLibrary.MyEnumInLibrary _libraryEnum,
        MyLocalTypeLibrary.MyStructInLibrary memory _libraryStruct,
        MyLocalTypeLibrary.MyTypeInLibrary _libraryType,
        MyLocalTypeContract.MyEnumInContract _contractEnum,
        MyLocalTypeContract.MyStructInContract memory _contractStruct,
        MyLocalTypeContract.MyTypeInContract _contractType
    ) {
        libraryEnum = _libraryEnum;
        libraryStruct = _libraryStruct;
        libraryType = _libraryType;
        contractEnum = _contractEnum;
        contractStruct = _contractStruct;
        contractType = _contractType;
    }
}
