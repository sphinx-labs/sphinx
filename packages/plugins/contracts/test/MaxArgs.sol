// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MaxArgs {
    uint public value;
    uint public value2;
    uint public value3;
    uint public value4;
    uint public value5;
    uint public value6;
    uint public value7;
    uint public value8;
    uint public value9;
    uint public value10;
    uint public value11;
    uint public value12;

    constructor(
        uint _value,
        uint _value2,
        uint _value3,
        uint _value4,
        uint _value5,
        uint _value6,
        uint _value7,
        uint _value8,
        uint _value9,
        uint _value10,
        uint _value11
    ) {
        value = _value;
        value2 = _value2;
        value3 = _value3;
        value4 = _value4;
        value5 = _value5;
        value6 = _value6;
        value7 = _value7;
        value8 = _value8;
        value9 = _value9;
        value10 = _value10;
        value11 = _value11;
    }

    function addValues(
        uint _value,
        uint _value2,
        uint _value3,
        uint _value4,
        uint _value5,
        uint _value6,
        uint _value7,
        uint _value8,
        uint _value9,
        uint _value10,
        uint _value11
    ) external {
        value += _value;
        value2 += _value2;
        value3 += _value3;
        value4 += _value4;
        value5 += _value5;
        value6 += _value6;
        value7 += _value7;
        value8 += _value8;
        value9 += _value9;
        value10 += _value10;
        value11 += _value11;
    }
}
