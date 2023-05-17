// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Storage } from "./Storage.sol";
import { Stateless } from "./Stateless.sol";

contract SimpleStorage {
    Storage public myStorage;
    Stateless public myStateless;
    Storage immutable public immutableContractReference;
    Stateless immutable public immutableStatelessReference;

    constructor(Storage _immutableContractReference, Stateless _statelessImmutableContractReference) {
        immutableContractReference = _immutableContractReference;
        immutableStatelessReference = _statelessImmutableContractReference;
    }

    function hello() public view returns (string memory) {
        return myStateless.hello();
    }
}
