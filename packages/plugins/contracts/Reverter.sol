// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ParentReverter } from "./ParentReverter.sol";

// contract Reverter is ParentReverter {
contract Reverter is ParentReverter {
    uint public x;
    uint public constant z = 2;
    function rev() external {
        x = 3;
    }
}
