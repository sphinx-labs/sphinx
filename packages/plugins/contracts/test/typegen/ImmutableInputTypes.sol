// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ImmutableInputTypes {
    uint8 public immutable myUint8;
    uint256 public immutable myUint;
    int64 public immutable myInt64;
    int256 public immutable myInt;
    address public immutable myAddress;
    bytes32 public immutable myBytes32;
    bool public immutable myBool;

    constructor(
        uint8 _myUint8,
        uint256 _myUint,
        int64 _myInt64,
        int256 _myInt,
        address _myAddress,
        bytes32 _myBytes32,
        bool _myBool
    ) {
        myUint8 = _myUint8;
        myUint = _myUint;
        myInt64 = _myInt64;
        myInt = _myInt;
        myAddress = _myAddress;
        myBytes32 = _myBytes32;
        myBool = _myBool;
    }
}
