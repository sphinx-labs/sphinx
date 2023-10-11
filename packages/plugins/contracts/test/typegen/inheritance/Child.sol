// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Parent } from "./Parent.sol";

contract Child is Parent {
    address public myAddress;

    constructor(uint256 _myNumber, bool _myBool, address _myAddress) Parent(_myNumber, _myBool) {
        myAddress = _myAddress;
    }

    function setMyAddress(address _value) public {
        myAddress = _value;
    }

    function myPureB() public pure returns (uint256) {
        return 2;
    }
}
