// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Child as AliasedChild} from "./Child.sol";

contract Grandchild is AliasedChild {
    bytes32 public myBytes32;

    constructor(uint256 _myNumber, bool _myBool, address _myAddress, bytes32 _myBytes)
        AliasedChild(_myNumber, _myBool, _myAddress)
    {
        myBytes32 = _myBytes;
    }

    function setMyBytes32(bytes32 _value) public {
        myBytes32 = _value;
    }

    function myPureC() public pure returns (bytes32) {
        return keccak256("3");
    }
}
