// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { SphinxManager } from "@sphinx-labs/contracts/contracts/SphinxManager.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Version } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

contract MyContract1 {
    int public intArg;
    int public secondIntArg;
    int public thirdIntArg;

    uint public uintArg;

    address public addressArg;
    address public otherAddressArg;

    struct MyStruct {
        int a;
        int b;
        MyNestedStruct c;
    }

    struct MyNestedStruct {
        address d;
    }

    constructor(int _intArg, uint _uintArg, address _addressArg, address _otherAddressArg) {
        intArg = _intArg;
        uintArg = _uintArg;
        addressArg = _addressArg;
        otherAddressArg = _otherAddressArg;
    }

    function incrementUint() external {
        uintArg += 1;
    }

    function set(int _int, int _secondInt) external {
        intArg = _int;
        secondIntArg = _secondInt;
    }

    function set(address _addr, address _otherAddr) external {
        addressArg = _addr;
        otherAddressArg = _otherAddr;
    }

    function setInts(int _a, int _b, int _c) external {
        intArg = _a;
        secondIntArg = _b;
        thirdIntArg = _c;
    }

    function setMyStructValues(MyStruct memory _myStruct) external {
        intArg = _myStruct.a;
        secondIntArg = _myStruct.b;
        addressArg = _myStruct.c.d;
    }

    function reverter() external pure {
        revert("reverter");
    }
}

contract MyContract2 {
    uint public number;

    function incrementMyContract2(uint _num) external {
        number += _num;
    }
}

contract MyOwnableContract is Ownable {
    uint256 public myOwnableValue;

    constructor(address _sphinxManager) {
        _transferOwnership(_sphinxManager);
    }

    function myOwnableFunction(uint256 _value) external onlyOwner {
        myOwnableValue = _value;
    }
}

contract MyAccessControlContract is AccessControl {
    uint256 public myAccessControlValue;

    constructor(address _sphinxManager) {
        _setupRole(DEFAULT_ADMIN_ROLE, _sphinxManager);
    }

    function myAccessControlFunction(uint256 _value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        myAccessControlValue = _value;
    }
}

contract MyBigContract is SphinxManager {

    uint public number;

    constructor(
    ) SphinxManager(
        ISphinxRegistry(address(0)),
        address(0),
        IAccessControl(address(0)),
        0,
        Version(0, 0, 0)
    ){
    }

    function incrementNumber(uint _num) external {
        number += _num;
    }
}
