// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract MyParent {
    uint[] public myArray;

    function second() external {
        myArray.push() = 2;
    }
}

contract HelloChugSplash is MyParent {
    type MyUserDefinedType is uint;
    // bytes public myDynBytes;
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;
    // MyUserDefinedType public immutable hi;

    // constructor(MyUserDefinedType _hi) {
    //     hi = _hi;
    // }
}
