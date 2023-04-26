// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

interface ICreate2 {
    function computeAddress(
        bytes32 _salt,
        bytes32 _bytecodeHash,
        address _deployer
    ) external pure returns (address);
}
