// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConflictingQualifiedNames {
    uint public x;

    constructor(uint _x) {
        x = _x;
    }

    function add(uint _y) public {
        x += _y;
    }
}

contract ConflictingQualifiedNameChildInSameFile is ConflictingQualifiedNames {
    uint public y;

    constructor(uint _y, uint _x) ConflictingQualifiedNames(_x) {
        y = _y;
    }

    function addY(uint _y) public {
        y += _y;
    }
}
