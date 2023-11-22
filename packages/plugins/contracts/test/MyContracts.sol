// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

struct TopLevelStruct {
    int256 a;
}

contract MyContract1 {
    int256 public intArg;
    int256 public secondIntArg;
    int256 public thirdIntArg;

    uint256 public uintArg;

    address public addressArg;
    address public otherAddressArg;

    struct MyStruct {
        int256 a;
        int256 b;
        MyNestedStruct c;
    }

    struct MyNestedStruct {
        address d;
    }

    constructor(int256 _intArg, uint256 _uintArg, address _addressArg, address _otherAddressArg) {
        intArg = _intArg;
        uintArg = _uintArg;
        addressArg = _addressArg;
        otherAddressArg = _otherAddressArg;
    }

    function incrementUint() external {
        uintArg += 1;
    }

    function set(int256 _int) external {
        intArg = _int;
    }

    function set(address _addr, address _otherAddr) external {
        addressArg = _addr;
        otherAddressArg = _otherAddr;
    }

    function setInts(int256 _a, int256 _b, int256 _c) external {
        intArg = _a;
        secondIntArg = _b;
        thirdIntArg = _c;
    }

    function setMyStructValues(MyStruct memory _myStruct) external {
        intArg = _myStruct.a;
        secondIntArg = _myStruct.b;
        addressArg = _myStruct.c.d;
    }

    function myPureFunction() external pure returns (MyStruct memory) {
        return MyStruct({ a: 42, b: 123, c: MyNestedStruct({ d: address(256) }) });
    }

    function reverter() external pure {
        revert("reverter");
    }
}

contract MyContract2 {
    uint256 public number;

    function incrementMyContract2(uint256 _num) external {
        number += _num;
    }
}

contract MyOwnable is Ownable {
    uint256 public value;

    constructor(address _sphinxManager, uint256 _initialValue) {
        value = _initialValue;
        _transferOwnership(_sphinxManager);
    }

    function increment() external {
        value += 1;
    }

    function set(uint256 _value) external onlyOwner {
        value = _value;
    }
}

contract MyAccessControl is AccessControl {
    uint256 public value;

    constructor(address _sphinxManager) {
        _setupRole(DEFAULT_ADMIN_ROLE, _sphinxManager);
    }

    function myAccessControlFunction(uint256 _value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        value = _value;
    }
}
