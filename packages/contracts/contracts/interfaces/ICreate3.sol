// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title ICreate3
 * @notice Interface for a Create3 contract. Normally, this functionality would in a library.
   Instead, we put it in a contract so that other contracts can use non-standard Create3 formulas in
   a modular way. If we opted for a library to implement this functionality, we would need separate
   copies of each contract that uses the library, where each contract would use a different
   implementation of the Create3 formula.
 */
interface ICreate3 {
    // The creation code isn't used in the address calculation.
    function deploy(
        bytes32 _salt,
        bytes memory _creationCode,
        uint256 _value
    ) external returns (address deployed);

    function getAddress(bytes32 _salt) external view returns (address);
}
