// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Storage } from "./Storage.sol";
import { Version } from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";

contract Stateless {
    uint public immutable immutableUint;
    Storage public immutable immutableContractReference;

    constructor(uint _immutableUint, Storage _immutableContractReference) {
        immutableUint = _immutableUint;
        immutableContractReference = _immutableContractReference;
    }

    function version() external pure returns (Version memory) {
        return Version(2, 0, 0);
    }

    function hello() external pure returns (string memory) {
        return "Hello, world!";
    }
}
