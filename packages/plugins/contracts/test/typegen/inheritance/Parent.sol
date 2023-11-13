// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract Parent {
    uint256 public myNumber;
    bool public myBool;

    constructor(uint256 _myNumber, bool _myBool) {
        myNumber = _myNumber;
        myBool = _myBool;
    }

    function add(uint256 _value) public virtual;

    function setBool(bool _value) public {
        myBool = _value;
    }

    function myPureA() public pure returns (uint256) {
        return 1;
    }
}
