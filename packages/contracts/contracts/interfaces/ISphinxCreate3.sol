// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ISphinxCreate3
 * @notice Interface for a Create3 contract. Normally, this functionality would exist as internal
 *         functions in a library, which can be inherited by other contracts. Instead, we put this
 *         functionality in a contract so that other contracts can use non-standard Create3 formulas
 *         in a modular way. These non-standard Create3 formulas exist on some EVM-compatible
 *         chains. Each Create3 contract that inherits from this interface will implement its own
 *         Create3 formula.
 *
 *         The contracts that inherit from this interface are meant to be delegatecalled by the
 *         `SphinxManager` in order to deploy contracts. It's important to note that a Create3
 *         contract must be delegatecalled by the `SphinxManager` and not called directly. This
 *         ensures that the address of the deployed contract is determined by the address of the
 *         `SphinxManager` contract and not the Create3 contract. Otherwise, it'd be possible for an
 *         attacker to snipe a user's contract by calling the `deploy` function on the Create3
 *         contract.
 */
interface ISphinxCreate3 {
    // The creation code isn't used in the address calculation.
    function deploy(
        bytes32 _salt,
        bytes memory _creationCode,
        uint256 _value
    ) external returns (address deployed);

    function getAddress(bytes32 _salt) external view returns (address);

    function getAddressFromDeployer(
        bytes32 _salt,
        address _deployer
    ) external view returns (address);
}
