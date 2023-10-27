// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Storage } from "./ContainsStorage.sol";
import { Stateless } from "./Stateless.sol";

contract SimpleStorage {
    Storage public myStorage;
    Stateless public myStateless;
    Storage public immutable immutableContractReference;
    Stateless public immutable immutableStatelessReference;

    constructor(
        Storage[] memory _immutableContractReference,
        Stateless _statelessImmutableContractReference
    ) {
        immutableContractReference = _immutableContractReference[0];
        immutableStatelessReference = _statelessImmutableContractReference;
    }

    function hello() public view returns (string memory) {
        return myStateless.hello();
    }
}
