// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title ICreate2
 * @notice Interface for a Create2 contract. Normally, this functionality would in a library.
   Instead, we put it in a contract so that other contracts can use non-standard CREATE2 formulas in
   a modular way. If we opted for a library to implement this functionality, we would need separate
   copies of each contract that uses it, each with a different implementation of the CREATE2
   formula.
 */
interface ICreate2 {
    /**
     * @notice Computes the address of a contract using the CREATE2 opcode.
     *
     * @param _salt        Arbitrary salt.
     * @param _bytecodeHash Hash of the creation bytecode appended with ABI-encoded constructor
            arguments.
     * @param _deployer   Address of the deployer.

     * @return Address of the computed contract.
     */
    function computeAddress(
        bytes32 _salt,
        bytes32 _bytecodeHash,
        address _deployer
    ) external pure returns (address);
}
