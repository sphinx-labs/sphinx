// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Storage } from "./Storage.sol";
import { Version } from "@chugsplash/contracts/contracts/Semver.sol";

contract Stateless {
    uint immutable public immutableUint;
    Storage immutable public immutableContractReference;

    constructor(uint _immutableUint, Storage _immutableContractReference) {
        immutableUint = _immutableUint;
        immutableContractReference = _immutableContractReference;
    }

    function version() external pure returns (Version memory) {
        return Version(2, 0, 0);
    }

    function hello() pure external returns (string memory) {
        return 'Hello, world!';
    }
}
