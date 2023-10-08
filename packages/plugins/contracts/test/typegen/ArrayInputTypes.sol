// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct MyStruct {
    uint8 myNumber;
}

type MyType is uint8;

contract MyContractType {
    uint8 public myNumber;

    constructor(uint8 _myNumber) {
        myNumber = _myNumber;
    }
}

enum MyEnum {
    A,
    B,
    C,
    D
}

contract ArrayInputTypes {
    uint8[] public myUintDynamicArray;
    bytes32[][] public myUintNestedDynamicArray;
    address[3] public myUintStaticArray;
    MyStruct[] public myStructArray;
    MyType[] public myTypeArray;
    MyContractType[] public myContractTypeArray;
    MyEnum[] public myEnumArray;

    constructor(
        uint8[] memory _myUintDynamicArray,
        bytes32[][] memory _myUintNestedDynamicArray,
        address[3] memory _myUintStaticArray,
        MyStruct[] memory _myStructArray,
        MyType[] memory _myTypeArray,
        MyContractType[] memory _myContractTypeArray,
        MyEnum[] memory _myEnumArray
    ) {
        myUintDynamicArray = _myUintDynamicArray;
        myUintNestedDynamicArray = _myUintNestedDynamicArray;
        myUintStaticArray = _myUintStaticArray;
        myStructArray.push(_myStructArray[0]);
        myStructArray.push(_myStructArray[1]);
        myTypeArray.push(_myTypeArray[0]);
        myTypeArray.push(_myTypeArray[1]);
        myContractTypeArray.push(_myContractTypeArray[0]);
        myContractTypeArray.push(_myContractTypeArray[1]);
        myEnumArray.push(_myEnumArray[0]);
        myEnumArray.push(_myEnumArray[1]);
    }

    function setValues(
        uint8[] memory _myUintDynamicArray,
        bytes32[][] memory _myUintNestedDynamicArray,
        address[3] memory _myUintStaticArray,
        MyStruct[] memory _myStructArray,
        MyType[] memory _myTypeArray,
        MyContractType[] memory _myContractTypeArray,
        MyEnum[] memory _myEnumArray
    ) public {
        myUintDynamicArray = _myUintDynamicArray;
        myUintNestedDynamicArray = _myUintNestedDynamicArray;
        myUintStaticArray = _myUintStaticArray;
        myStructArray[0] = _myStructArray[0];
        myStructArray[1] = _myStructArray[1];
        myTypeArray[0] = _myTypeArray[0];
        myTypeArray[1] = _myTypeArray[1];
        myContractTypeArray[0] = MyContractType(_myContractTypeArray[0]);
        myContractTypeArray[1] = MyContractType(_myContractTypeArray[1]);
        myEnumArray[0] = _myEnumArray[0];
        myEnumArray[1] = _myEnumArray[1];
    }

    function returnValues()
        public
        pure
        returns (
            uint8[] memory,
            bytes32[][] memory,
            address[3] memory,
            MyStruct[] memory,
            MyType[] memory,
            MyContractType[] memory,
            MyEnum[] memory
        )
    {
        uint8[] memory intialUintDynamicArray;
        bytes32[][] memory initialUintNestedDynamicArray;
        address[3] memory initialUintStaticArray;
        MyStruct[] memory initialMyStructArray;
        MyType[] memory initialMyTypeArray;
        MyContractType[] memory initialMyContractTypeArray;
        MyEnum[] memory initialMyEnumArray;
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
        initialMyStructArray = new MyStruct[](2);
        initialMyStructArray[0] = MyStruct(10);
        initialMyStructArray[1] = MyStruct(11);
        initialMyTypeArray = new MyType[](2);
        initialMyTypeArray[0] = MyType.wrap(12);
        initialMyTypeArray[1] = MyType.wrap(13);
        initialMyContractTypeArray = new MyContractType[](2);
        initialMyContractTypeArray[0] = MyContractType(address(14));
        initialMyContractTypeArray[1] = MyContractType(address(15));
        initialMyEnumArray = new MyEnum[](2);
        initialMyEnumArray[0] = MyEnum.A;
        initialMyEnumArray[1] = MyEnum.B;
        return (
            intialUintDynamicArray,
            initialUintNestedDynamicArray,
            initialUintStaticArray,
            initialMyStructArray,
            initialMyTypeArray,
            initialMyContractTypeArray,
            initialMyEnumArray
        );
    }
}
