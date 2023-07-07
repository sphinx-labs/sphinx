// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Version } from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";

contract Stateless {
    uint public immutable immutableUint;
    address public immutable immutableAddress;

    constructor(uint _immutableUint, address _immutableAddress) {
        immutableUint = _immutableUint;
        immutableAddress = _immutableAddress;
    }

    function version() external pure returns (Version memory) {
        return Version(2, 0, 0);
    }

    function hello() external pure returns (string memory) {
        return "Hello, world!";
    }
}
