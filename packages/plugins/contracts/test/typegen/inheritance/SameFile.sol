// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ParentInSameFile {
    uint public myNumber;

    constructor(uint256 _myNumber) {
        myNumber = _myNumber;
    }

    function add(uint256 _value) public {
        myNumber += _value;
    }
}

contract ChildInSameFile is ParentInSameFile {
    bool public myBool;

    constructor(uint256 _myNumber, bool _myBool) ParentInSameFile(_myNumber) {
        myBool = _myBool;
    }

    function setBool(bool _value) public {
        myBool = _value;
    }
}
