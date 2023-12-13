// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { SphinxLeafWithProof, MerkleRootStatus } from "../SphinxDataTypes.sol";

/**
 * @notice The interface of the `SphinxModule` contract.
 */
interface ISphinxModule {
    /**
     * @notice Emitted when an `EXECUTE` leaf fails in the Gnosis Safe.
     *
     * @param merkleRoot The Merkle root that contains the failing action.
     * @param leafIndex  The index of the leaf in the Merkle tree.
     */
    event SphinxActionFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    /**
     * @notice Emitted when an `EXECUTE` Merkle leaf succeeds in the Gnosis Safe.
     *
     * @param merkleRoot The Merkle root that contains the action that succeeded.
     * @param leafIndex  The index of the leaf in the Merkle tree.
     */
    event SphinxActionSucceeded(bytes32 indexed merkleRoot, uint256 leafIndex);

    /**
     * @notice Emitted when a Merkle root is approved.
     *
     * @param merkleRoot         The Merkle root that was approved.
     * @param nonce              The `nonce` field in the `APPROVE` leaf. This matches the nonce
     *                           in the `SphinxModuleProxy` before the approval occurred.
     * @param executor           The address of the caller.
     * @param numLeaves          The total number of leaves in the Merkle tree on the current chain.
     * @param uri                The URI of the Merkle root. This may be an empty string.
     */
    event SphinxMerkleRootApproved(
        bytes32 indexed merkleRoot,
        uint256 indexed nonce,
        address executor,
        uint256 numLeaves,
        string uri
    );

    /**
     * @notice Emitted when an active Merkle root is canceled.
     *
     * @param completedMerkleRoot The Merkle root that contains the `CANCEL` leaf which canceled the
     *                            active Merkle root.
     * @param canceledMerkleRoot  The Merkle root that was canceled.
     * @param nonce               The `nonce` field in the `CANCEL` leaf. This matches the nonce
     *                            in the `SphinxModuleProxy` before the cancellation occurred.
     * @param executor            The address of the caller.
     * @param uri                 The URI of the Merkle root that contains the `CANCEL` leaf (not
     *                            the Merkle root that was cancelled). This may be an empty string.
     */
    event SphinxMerkleRootCanceled(
        bytes32 indexed completedMerkleRoot,
        bytes32 indexed canceledMerkleRoot,
        uint256 indexed nonce,
        address executor,
        string uri
    );

    /**
     * @notice Emitted when a Merkle root is completed.
     *
     * @param merkleRoot The Merkle root that was completed.
     */
    event SphinxMerkleRootCompleted(bytes32 indexed merkleRoot);

    /**
     * @notice Emitted when an action fails due to a transaction reverting in the Gnosis Safe.
     *
     * @param merkleRoot The Merkle root that contains the failed action.
     * @param leafIndex  The index of the leaf in the Merkle tree that caused the failure.
     */
    event SphinxMerkleRootFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    /**
     * @notice The version of the `SphinxModule`.
     */
    function VERSION() external view returns (string memory);

    /**
     * @notice The Merkle root that is currently active. This means that it has been signed
     *         off-chain by the Gnosis Safe owner(s) and approved on-chain. This is `bytes32(0)` if
     *         there is no active Merkle root.
     */
    function activeMerkleRoot() external view returns (bytes32);

    /**
     * @notice Approve a new Merkle root, which must be signed by a sufficient number of Gnosis Safe
     *         owners.
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
     * @notice Cancel an active Merkle root. The Gnosis Safe owners(s) can cancel an active Merkle
     *         root by signing a different Merkle root that contains a `CANCEL` Merkle leaf. This
     *         new Merkle root is submitted to this function.
     *
     * @param _root          The Merkle root that contains the `CANCEL` leaf. This is _not_ the
     *                       active Merkle root.
     * @param _leafWithProof The `CANCEL` Merkle leaf and its Merkle proof, which must yield the
     *                       `_root` supplied to this function (not the active Merkle root).
     * @param _signatures    The signatures of the Gnosis Safe owners that signed the Merkle root
     *                       that contains the `CANCEL` leaf.
     */
    function cancel(
        bytes32 _root,
        SphinxLeafWithProof memory _leafWithProof,
        bytes memory _signatures
    ) external;

    /**
     * @notice The current nonce in this contract. This is incremented each time a Merkle root is
     *         used for the first time in the current contract. This can occur by using the Merkle
     *         root to approve a deployment, or cancel an active one. The nonce removes the
     *         possibility that a Merkle root can be signed by the owners, then submitted on-chain
     *         far into the future, even after other Merkle roots have been submitted. The nonce
     *         also allows the Gnosis Safe owners to cancel a Merkle root that has been signed
     *         off-chain, but has not been approved on-chain. In this situation, the owners can
     *         approve a new Merkle root that has the same nonce, then approve it on-chain,
     *         preventing the old Merkle root from ever being approved.
     */
    function merkleRootNonce() external view returns (uint256);

    /**
     * @notice Mapping from a Merkle root to its `MerkleRootState` struct.
     */
    function merkleRootStates(
        bytes32
    )
        external
        view
        returns (
            uint256 numLeaves,
            uint256 leavesExecuted,
            string memory uri,
            address executor,
            MerkleRootStatus status,
            bool arbitraryChain
        );

    /**
     * @notice Execute a set of Merkle leaves. These leaves must belong to the active Merkle root,
     *         which must have been approved by the Gnosis Safe owners in the `approve` function.
     *
     * @param _leavesWithProofs An array of `EXECUTE` Merkle leaves, along with their Merkle proofs.
     */
    function execute(SphinxLeafWithProof[] memory _leavesWithProofs) external;

    /**
     * @notice Initializes this contract. It's necessary to use an initializer function instead of a
     *         constructor because this contract is meant to exist behind an EIP-1167 proxy, which
     *         isn't able to use constructor arguments.
     *
     *         This call will revert if the input Gnosis Safe proxy's singleton has a `VERSION()`
     *         function that does not equal "1.3.0" or "1.4.1". This prevents users from
     *         accidentally adding the module to an incompatible Safe. This does _not_ ensure that
     *         the Gnosis Safe singleton isn't malicious. If a singleton has a valid `VERSION()`
     *         function and arbitrary malicious logic, this call would still consider the singleton
     *         to be valid.
     *
     * @param _safeProxy The address of the Gnosis Safe proxy that this contract belongs to.
     */
    function initialize(address _safeProxy) external;

    /**
     * @notice The address of the Gnosis Safe proxy that this contract belongs to.
     */
    function safeProxy() external view returns (address payable);
}
