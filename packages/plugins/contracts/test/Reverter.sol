// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Reverter {
    constructor() {
        revert("Reverter: revert");
    }
}
