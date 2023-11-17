// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { SphinxLeafWithProof, DeploymentStatus } from "../SphinxDataTypes.sol";
// TODO(end): replace with IGnosisSafe
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";

/**
 * @notice The interface of the `SphinxModule` contract.
 */
interface ISphinxModule {
    /**
     * @notice Emitted when an `EXECUTE` Merkle leaf fails in the Gnosis Safe.
     *
     * @param merkleRoot The Merkle root of the deployment.
     * @param leafIndex  The index of the leaf in the Merkle tree.
     */
    event SphinxActionFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    /**
     * @notice Emitted when an `EXECUTE` Merkle leaf succeeds in the Gnosis Safe.
     *
     * @param merkleRoot The Merkle root of the deployment.
     * @param leafIndex  The index of the leaf in the Merkle tree.
     */
    event SphinxActionSucceeded(bytes32 indexed merkleRoot, uint256 leafIndex);

    /**
     * @notice Emitted when a Merkle root is approved.
     *
     * @param merkleRoot         The Merkle root of the deployment.
     * @param previousActiveRoot The previous active Merkle root. This is `bytes32(0)` if there
     *                           was no active root.
     * @param nonce              The nonce of the deployment in the `SphinxModule`.
     * @param executor           The address of the caller.
     * @param numLeaves          The total number of leaves in the Merkle tree on the current chain.
     * @param uri                The IPFS URI of the deployment. This contains information such as
     *                           the Solidity compiler inputs, which allows the executor to verify
     *                           the user's smart contracts on Etherscan. This can be an empty
     *                           string if there is only a single leaf on the current network (the
     *                           `APPROVE` leaf).
     */
    event SphinxDeploymentApproved(
        bytes32 indexed merkleRoot,
        bytes32 indexed previousActiveRoot,
        uint256 indexed nonce,
        address executor,
        uint256 numLeaves,
        string uri
    );

    /**
     * @notice Emitted when an active Merkle root is cancelled by the Gnosis Safe owners.
     *
     * @param merkleRoot The Merkle root of the deployment that was cancelled.
     */
    event SphinxDeploymentCancelled(bytes32 indexed merkleRoot);

    /**
     * @notice Emitted when a deployment is completed.
     *
     * @param merkleRoot The Merkle root of the deployment.
     */
    event SphinxDeploymentCompleted(bytes32 indexed merkleRoot);

    /**
     * @notice Emitted when a deployment fails due to a transaction reverting in the Gnosis Safe.
     *
     * @param merkleRoot The Merkle root of the deployment that failed.
     * @param leafIndex  The index of the leaf in the Merkle tree that caused the failure.
     */
    event SphinxDeploymentFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    /**
     * @notice The version of the `SphinxModule`.
     */
    function VERSION() external view returns (string memory);

    /**
     * @notice The Merkle root that is currently approved. This is `bytes32(0)` if there
     *         is no active deployment.
     */
    function activeMerkleRoot() external view returns (bytes32);

    /**
     * @notice Approve a new Merkle root, which must be signed by a sufficient number of Gnosis Safe
     *         owners. Will revert if the Merkle root has ever been approved in this contract
     *         before.
     *
     * @param _root          The Merkle root to approve.
     * @param _leafWithProof The `APPROVE` Merkle leaf and its Merkle proof, which must yield the
     *                       Merkle root.
     * @param _signatures    The signatures of the Gnosis Safe owners.
     */
    function approve(
        bytes32 _root,
        SphinxLeafWithProof memory _leafWithProof,
        bytes memory _signatures
    ) external;

    /**
     * @notice The current nonce in this contract. Each time a Merkle root is approved, this nonce
     *         is incremented. The main purpose is to allow the Gnosis Safe owners to cancel a
     *         Merkle root that has been signed off-chain, but has not been approved on-chain. In
     *         this situation, the owners can approve a new Merkle root that has the same nonce,
     *         then approve it on-chain, preventing the old Merkle root from ever being approved.
     *         The nonce also removes the possibility that a Merkle root can be signed by the
     *         owners, then approved far into the future, even after other Merkle roots have been
     *         approved.
     */
    function currentNonce() external view returns (uint256);

    /**
     * @notice Mapping from a Merkle root to its `DeploymentState` struct.
     */
    function deployments(
        bytes32
    )
        external
        view
        returns (
            uint256 numLeaves,
            uint256 leavesExecuted,
            string memory uri,
            address executor,
            DeploymentStatus status,
            bool arbitraryChain
        );

    /**
     * @notice Execute a set of Merkle leaves. These leaves must belong to the active Merkle root,
     *         which must have been approved by the Gnosis Safe owners in the `approve` function.
     *
     * @param _leavesWithProofs An array of `EXECUTE` Merkle leaves, along with their Merkle proofs.
     *
     * @return The status of the deployment for the active Merkle root at the end of this call.
     */
    function execute(
        SphinxLeafWithProof[] memory _leavesWithProofs
    ) external returns (DeploymentStatus);

    /**
     * @notice Initializes this contract. It's necessary to use an initializer function instead of a
     *         constructor because this contract is meant to exist behind an EIP-1167 proxy, which
     *         isn't able to use constructor arguments.
     *
     * @param _safeProxy The address of the Gnosis Safe proxy that this contract belongs to.
     */
    function initialize(address _safeProxy) external;

    /**
     * @notice The Gnosis Safe proxy that corresponds to this contract.
     */
    function safeProxy() external view returns (GnosisSafe);
}
