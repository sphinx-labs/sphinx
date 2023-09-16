// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ArrayInputTypes {
    uint8[] public myUintDynamicArray;
    bytes32[][] public myUintNestedDynamicArray;
    address[3] public myUintStaticArray;

    constructor(
        uint8[] memory _myUintDynamicArray,
        bytes32[][] memory _myUintNestedDynamicArray,
        address[3] memory _myUintStaticArray
    ) {
        myUintDynamicArray = _myUintDynamicArray;
        myUintNestedDynamicArray = _myUintNestedDynamicArray;
        myUintStaticArray = _myUintStaticArray;
    }

    function setValues(
        uint8[] memory _myUintDynamicArray,
        bytes32[][] memory _myUintNestedDynamicArray,
        address[3] memory _myUintStaticArray
    ) public {
        myUintDynamicArray = _myUintDynamicArray;
        myUintNestedDynamicArray = _myUintNestedDynamicArray;
        myUintStaticArray = _myUintStaticArray;
    }

    function returnValues()
        public
        pure
        returns (uint8[] memory, bytes32[][] memory, address[3] memory)
    {
        uint8[] memory intialUintDynamicArray;
        bytes32[][] memory initialUintNestedDynamicArray;
        address[3] memory initialUintStaticArray;
        intialUintDynamicArray = new uint8[](2);
        intialUintDynamicArray[0] = 1;
        intialUintDynamicArray[1] = 2;
        initialUintNestedDynamicArray = new bytes32[][](2);
        initialUintNestedDynamicArray[0] = new bytes32[](2);
        initialUintNestedDynamicArray[0][0] = keccak256("3");
        initialUintNestedDynamicArray[0][1] = keccak256("4");
        initialUintNestedDynamicArray[1] = new bytes32[](2);
        initialUintNestedDynamicArray[1][0] = keccak256("5");
        initialUintNestedDynamicArray[1][1] = keccak256("6");
        initialUintStaticArray = [address(7), address(8), address(9)];
        return (intialUintDynamicArray, initialUintNestedDynamicArray, initialUintStaticArray);
    }
}
