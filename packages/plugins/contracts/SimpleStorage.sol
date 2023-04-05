// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Storage } from "./Storage.sol";
import { Stateless } from "./Stateless.sol";

contract SimpleStorage {
    Storage public myStorage;
    Stateless public myStateless;

    function hello() public view returns (string memory) {
        return myStateless.hello();
    }
}
