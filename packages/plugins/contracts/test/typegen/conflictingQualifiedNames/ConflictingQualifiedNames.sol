// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConflictingQualifiedNames {
    uint256 public x;

    constructor(uint256 _x) {
        x = _x;
    }

    function add(uint256 _y) public {
        x += _y;
    }
}

contract ConflictingQualifiedNameChildInSameFile is ConflictingQualifiedNames {
    uint256 public y;

    constructor(uint256 _y, uint256 _x) ConflictingQualifiedNames(_x) {
        y = _y;
    }

    function addY(uint256 _y) public {
        y += _y;
    }
}
