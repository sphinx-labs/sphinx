// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { MyLibraryOne } from "./MyContracts.sol";

// This contract must be in its own file to test a specific case for the `assertNoLinkedLibraries`
// function in `utils.spec.ts`.
contract MyLinkedLibraryContract {
    function myLinkedLibraryFunction() external pure returns (uint256) {
        return MyLibraryOne.myFirstLibraryFunction();
    }
}
