// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ParentOverrides {
    uint public myNumber;

    constructor(uint256 _myNumber) {
        myNumber = _myNumber;
    }

    function add(uint256 _value) public virtual {
        myNumber += _value;
    }
}

contract ChildOverrides is ParentOverrides {
    constructor(uint256 _myNumber) ParentOverrides(_myNumber) {}

    function add(uint _value) public override {
        myNumber = myNumber * _value;
    }
}
