// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title Reverter
 * @notice Contract that always reverts when called.
 */
contract Reverter {
    fallback() external {
        revert();
    }
}
