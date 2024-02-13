// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Reverter {
    function doRevert() external {
        revert("Reverter: revert");
    }

    function hi() external {
        
    }
}
