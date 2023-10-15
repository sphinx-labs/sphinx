// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ConflictingQualifiedNames } from "./A/ConflictingQualifiedNames.sol";

contract ConflictingQualifiedNameChild is ConflictingQualifiedNames {
    uint public x2;

    constructor(uint _x2, bool _x) ConflictingQualifiedNames(_x) {
        x2 = _x2;
    }

    function add(uint _y) public {
        x2 += _y;
    }
}
