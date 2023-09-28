// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract StateDependentActions {
    Box constructorBox;
    Box externallyDeployedBox;
    uint multiple;

    constructor (address _myOtherContract, uint _multiple) {
        externallyDeployedBox = Box(_myOtherContract);
        externallyDeployedBox.addValue(3);
        multiple = _multiple;
        constructorBox = new Box(1);
        constructorBox.addValue(2);
    }

    function setMultiple(uint _multiple) public {
        multiple = _multiple;
    }

    function fetchConstructorBoxValue() public view returns (uint) {
        return constructorBox.value() * multiple;
    }

    function fetchExternallyDeployedBoxValue() public view returns (uint) {
        return externallyDeployedBox.value() * multiple;
    }
}

contract Box {
    uint public value;

    constructor (uint _value) {
        value = _value;
    }

    function addValue(uint _number) public {
        value += _number;
    }
}