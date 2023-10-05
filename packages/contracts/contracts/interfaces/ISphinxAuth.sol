// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { AuthStatus, AuthLeaf } from "../SphinxDataTypes.sol";

/**
 * @title SphinxManager
 * @notice Interface that must be inherited by the SphinxAuth contract.
 */
interface ISphinxAuth {
    function authStates(bytes32) external view returns (AuthStatus, uint256, uint256);

    function threshold() external view returns (uint256);

    function firstProposalOccurred() external view returns (bool);

    /**
     * @notice Sets initial proposers. The number of owner signatures must be greater than
     *         or equal to the threshold.

               This is the only permissioned function in this contract that doesn't require
               that the auth Merkle root has been proposed in a separate transaction.

               This function is callable until the first proposal occurs. This allows for the
               possibility that the owners mistakenly enter invalid initial proposers. For
               example, they may enter proposers addresses that don't exist on this chain. If this
               function was only callable once, then this contract would be unusable in this
               scenario, since every other public function requires that a proposal has occurred.
     *
     * @param _authRoot Auth Merkle root for the Merkle tree that the owners approved.
     * @param _leaf AuthLeaf struct. This is the decoded leaf of the auth tree.
     * @param _signatures List of meta transaction signatures. Must correspond to signer addresses
     *                    in ascending order (see `_verifySignatures` for more info).
     * @param _proof    Merkle proof of the leaf in the auth tree.
     */
    function setup(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) external;

    /**
     * @notice Allows a proposer to propose a new auth Merkle root. This function may
     * be called as the first leaf of a new auth Merkle tree, or as the second leaf
     * after the `setup` function has been called.
     *
     * @param _authRoot The auth Merkle root to propose.
     * @param _leaf The leaf that contains the proposal info.
     * @param _signatures The meta transaction signature of the proposer that proves the
     */
    function propose(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) external;

    function upgradeManagerAndAuthImpl(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) external;

    function approveDeployment(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) external;

    function cancelActiveDeployment(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) external;
}
