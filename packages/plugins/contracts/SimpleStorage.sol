// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Storage } from "./Storage.sol";
import { Stateless } from "./Stateless.sol";

contract SimpleStorage {
    // Storage immutable public immutableContractReference;
    // Stateless immutable public immutableStatelessReference;

    constructor() {
    // constructor(Storage _immutableContractReference, Stateless _statelessImmutableContractReference) {
        revert('hello');
        // immutableContractReference = _immutableContractReference;
        // immutableStatelessReference = _statelessImmutableContractReference;
    }

    // function hello() public view returns (string memory) {
    //     return myStateless.hello();
    // }
}
