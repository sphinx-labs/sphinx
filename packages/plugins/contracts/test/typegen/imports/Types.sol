// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

type MyTopLevelType is bool;

struct MyTopLevelStruct {
    bool a;
}

enum MyTopLevelEnum {
    TopLevel
}

library MyTypeLibrary {
    type MyTypeInLibrary is uint8;

    struct MyStructInLibrary {
        uint8 a;
    }

    enum MyEnumInLibrary {
        Enum,
        Library
    }
}

contract MyTypeContract {
    type MyTypeInContract is bytes32;

    struct MyStructInContract {
        bytes32 a;
    }

    enum MyEnumInContract {
        Enum,
        In,
        Contract
    }
}
