// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BasicInputTypes {
    uint8 public myUint8;
    uint public myUint;
    int64 public myInt64;
    int public myInt;
    address public myAddress;
    bytes32 public myBytes32;
    bytes public myBytes;
    bool public myBool;
    string public myString;

    constructor(
        uint8 _myUint8,
        uint _myUint,
        int64 _myInt64,
        int _myInt,
        address _myAddress,
        bytes32 _myBytes32,
        bytes memory _myBytes,
        bool _myBool,
        string memory _myString
    ) {
        myUint8 = _myUint8;
        myUint = _myUint;
        myInt64 = _myInt64;
        myInt = _myInt;
        myAddress = _myAddress;
        myBytes32 = _myBytes32;
        myBytes = _myBytes;
        myBool = _myBool;
        myString = _myString;
    }

    function setValues(
        uint8 _myUint8,
        uint _myUint,
        int64 _myInt64,
        int _myInt,
        address _myAddress,
        bytes32 _myBytes32,
        bytes memory _myBytes,
        bool _myBool,
        string memory _myString
    ) public {
        myUint8 = _myUint8;
        myUint = _myUint;
        myInt64 = _myInt64;
        myInt = _myInt;
        myAddress = _myAddress;
        myBytes32 = _myBytes32;
        myBytes = _myBytes;
        myBool = _myBool;
        myString = _myString;
    }

    function returnValues()
        public
        pure
        returns (uint8, uint, int64, int, address, bytes32, bytes memory, bool, string memory)
    {
        return (6, 5, 4, 3, address(2), keccak256("1"), bytes("pure"), true, "function");
    }
}
