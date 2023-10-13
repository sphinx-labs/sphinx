// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library MyLibrary {
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
