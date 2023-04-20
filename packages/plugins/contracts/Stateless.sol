// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Storage } from "./Storage.sol";

contract Stateless {
    uint immutable public immutableUint;
    Storage immutable public immutableContractReference;

    constructor(uint _immutableUint, Storage _immutableContractReference) {
        immutableUint = _immutableUint;
        immutableContractReference = _immutableContractReference;
    }

    function hello() pure external returns (string memory) {
        return 'Hello, world!';
    }
}
