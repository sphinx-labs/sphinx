// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
// We import `GnosisSafe` v1.3.0 here, but this contract also supports `GnosisSafeL2.sol` (v1.3.0)
// as well as `Safe.sol` and `SafeL2.sol` from Safe v1.4.1. All of these contracts share the same
// interface for the functions used in this contract.
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
// Likewise, we deploy `IProxy` v1.3.0 here, but this contract also supports `IProxy` v1.4.1.
import { IProxy } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {
    SphinxLeafType,
    SphinxLeaf,
    SphinxLeafWithProof,
    MerkleRootState,
    MerkleRootStatus
} from "./SphinxDataTypes.sol";
import { ISphinxModule } from "./interfaces/ISphinxModule.sol";

/**
 * @title SphinxModule
 * @notice The `SphinxModule` contains the logic that executes deployments in a Gnosis Safe and
 *         verifies that the Gnosis Safe owners have signed the Merkle root that contains
 *         the deployment. It also contains logic for cancelling active Merkle roots.
 *
 *         The `SphinxModule` exists as an implementation contract, which is delegatecalled
 *         by minimal, non-upgradeable EIP-1167 proxy contracts. We use this architecture
 *         because it's considerably cheaper to deploy an EIP-1167 proxy than a `SphinxModule`.
 */
contract SphinxModule is ReentrancyGuard, Enum, ISphinxModule, Initializable {
    /**
     * @inheritdoc ISphinxModule
     */
    string public constant override VERSION = "1.0.0"; // TODO(later): what version?

    /**
     * @dev The hash of the version string for the Gnosis Safe proxy v1.3.0.
     */
    bytes32 internal constant SAFE_VERSION_HASH_1_3_0 = keccak256("1.3.0");

    /**
     * @dev The hash of the version string for the Gnosis Safe proxy v1.4.1.
     */
    bytes32 internal constant SAFE_VERSION_HASH_1_4_1 = keccak256("1.4.1");

    /**
     * @dev The EIP-712 domain separator, which displays a bit of context to the user
     *      when they sign the Merkle root off-chain.
     */
    bytes32 internal constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256(bytes("Sphinx")),
                keccak256(bytes(VERSION))
            )
        );

    /**
     * @dev The EIP-712 type hash, which just contains the Merkle root.
     */
    bytes32 internal constant TYPE_HASH = keccak256("MerkleRoot(bytes32 root)");

    /**
     * @inheritdoc ISphinxModule
     */
    mapping(bytes32 => MerkleRootState) public override merkleRootStates;

    /**
     * @inheritdoc ISphinxModule
     */
    bytes32 public override latestMerkleRoot;

    /**
     * @inheritdoc ISphinxModule
     */
    address payable public override safeProxy;

    /**
     * @notice Locks the `SphinxModule` implementation contract so it can't be
     *         initialized directly.
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @inheritdoc ISphinxModule
     */
    function initialize(address _safeProxy) external override initializer {
        require(_safeProxy != address(0), "SphinxModule: invalid Safe address");

        // Check that the Gnosis Safe proxy has a singleton with a valid version. This check
        // prevents users from accidentally adding the module to a Gnosis Safe with an invalid
        // version.
        address safeSingleton = IProxy(_safeProxy).masterCopy();
        string memory safeVersion = GnosisSafe(payable(safeSingleton)).VERSION();
        bytes32 safeVersionHash = keccak256(abi.encodePacked(safeVersion));
        require(
            safeVersionHash == SAFE_VERSION_HASH_1_3_0 ||
                safeVersionHash == SAFE_VERSION_HASH_1_4_1,
            "SphinxModule: invalid Safe version"
        );

        safeProxy = payable(_safeProxy);
    }

    /**
     * @inheritdoc ISphinxModule
     */
    function approve(
        bytes32 _root,
        SphinxLeafWithProof memory _leafWithProof,
        bytes memory _signatures
    )
        public
        override
        // We add a re-entrancy guard out of an abundance of caution. It's possible for the call to
        // the Gnosis Safe's `checkSignatures` function to call into another contract when
        // validating an EIP-1271 contract signature.
        nonReentrant
    {
        require(_root != bytes32(0), "SphinxModule: invalid root");

        // Check that the Merkle root hasn't been used before.
        MerkleRootState storage state = merkleRootStates[_root];
        require(state.status == MerkleRootStatus.EMPTY, "SphinxModule: root already used");

        SphinxLeaf memory leaf = _leafWithProof.leaf;
        // Revert if the Merkle leaf does not yield the Merkle root, given the Merkle proof.
        require(
            MerkleProof.verify(_leafWithProof.proof, _root, _getLeafHash(leaf)),
            "SphinxModule: failed to verify leaf"
        );

        require(leaf.leafType == SphinxLeafType.APPROVE, "SphinxModule: invalid leaf type");
        // The `APPROVE` leaf must always have an index of 0.
        require(leaf.index == 0, "SphinxModule: invalid leaf index");

        // Decode the `APPROVE` leaf data.
        (
            address leafSafeProxy,
            address moduleProxy,
            bytes32 previousMerkleRoot,
            uint256 previousLeavesExecuted,
            uint256 numLeaves,
            address executor,
            string memory uri,
            bool arbitraryChain
        ) = abi.decode(leaf.data, (address, address, bytes32, uint256, uint256, address, string, bool));

        require(leafSafeProxy == address(safeProxy), "SphinxModule: invalid SafeProxy");
        require(moduleProxy == address(this), "SphinxModule: invalid SphinxModuleProxy");
        require(previousMerkleRoot == latestMerkleRoot, "TODO(docs)");
        require(merkleRootStates[latestMerkleRoot].leavesExecuted == previousLeavesExecuted, "TODO(docs0)");
        // The `numLeaves` must be at least `1` because there must always be an `APPROVE` leaf.
        require(numLeaves > 0, "SphinxModule: numLeaves cannot be 0");
        require(executor == msg.sender, "SphinxModule: caller isn't executor");
        // The current chain ID must match the leaf's chain ID, or the Merkle root must
        // be executable on an arbitrary chain.
        require(leaf.chainId == block.chainid || arbitraryChain, "SphinxModule: invalid chain id");
        // If the Merkle root can be executable on an arbitrary chain, the leaf must have a chain ID
        // of 0. This isn't strictly necessary; it just enforces a convention.
        require(!arbitraryChain || leaf.chainId == 0, "SphinxModule: leaf chain id must be 0");
        // We don't validate the `uri` because we allow it to be empty.

        emit SphinxMerkleRootApproved(_root, previousMerkleRoot, msg.sender, numLeaves, uri);

        // Assign values to all fields of the new Merkle root's `MerkleRootState` except for the
        // `status` field, which will be assigned below.
        state.numLeaves = numLeaves;
        state.leavesExecuted = 1;
        state.uri = uri;
        state.executor = msg.sender;
        state.arbitraryChain = arbitraryChain;

        // If there is only an `APPROVE` leaf, mark the Merkle root as completed. The purpose of
        // this is to allow the Gnosis Safe owners to cancel a different Merkle root that has been
        // signed off-chain, but has not been approved in this contract. The owners can do this by
        // by signing a new Merkle root that has the same Merkle root nonce and approving it
        // on-chain. This prevents the old Merkle root from ever being approved. In the event that
        // the Gnosis Safe owners want to cancel a Merkle root without approving a new deployment,
        // they can simply approve a Merkle root that contains a single `APPROVE` leaf.
        if (numLeaves == 1) {
            emit SphinxMerkleRootCompleted(_root);
            state.status = MerkleRootStatus.COMPLETED;
        } else {
            // We set the status to `APPROVED` because there are `EXECUTE` leaves in this Merkle tree.
            state.status = MerkleRootStatus.APPROVED;
        }

        latestMerkleRoot = _root;

        // Check that a sufficient number of Gnosis Safe owners have signed the Merkle root (or,
        // more specifically, EIP-712 data that includes the Merkle root). We do this last to
        // follow the checks-effects-interactions pattern, since it's possible for `checkSignatures`
        // to call into another contract if it's validating an EIP-1271 contract signature.
        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _root))
        );
        GnosisSafe(payable(leafSafeProxy)).checkSignatures(
            keccak256(typedData),
            typedData,
            _signatures
        );
    }

    /**
     * @inheritdoc ISphinxModule
     */
    function execute(SphinxLeafWithProof[] memory _leavesWithProofs) public override nonReentrant {
        uint256 numActions = _leavesWithProofs.length;
        require(numActions > 0, "SphinxModule: no leaves to execute");
        // We cache the latest Merkle root in memory because it reduces the amount of gas used in
        // this call.
        bytes32 cachedLatestMerkleRoot = latestMerkleRoot;
        require(cachedLatestMerkleRoot != bytes32(0), "SphinxModule: no active root");

        MerkleRootState storage state = merkleRootStates[cachedLatestMerkleRoot];

        require(state.executor == msg.sender, "SphinxModule: caller isn't executor");

        // Cache the `leavesExecuted` state variable to reduce the number of SLOADs in this call.
        uint256 leavesExecuted = state.leavesExecuted;

        // Revert if the number of previously executed leaves plus the number of leaves in the current
        // array is greater than the `numLeaves` specified in the `approve` function.
        require(
            state.numLeaves >= leavesExecuted + numActions,
            "SphinxModule: extra leaves not allowed"
        );

        // Cache the `arbitraryChain` boolean. This reduces the amount of SLOADs in this function.
        bool arbitraryChain = state.arbitraryChain;

        SphinxLeaf memory leaf;
        bytes32[] memory proof;
        // Iterate through each of the Merkle leaves in the array.
        for (uint256 i = 0; i < numActions; i++) {
            leaf = _leavesWithProofs[i].leaf;
            proof = _leavesWithProofs[i].proof;

            require(
                MerkleProof.verify(proof, cachedLatestMerkleRoot, _getLeafHash(leaf)),
                "SphinxModule: failed to verify leaf"
            );
            require(leaf.leafType == SphinxLeafType.EXECUTE, "SphinxModule: invalid leaf type");
            // Revert if the current leaf is being executed in the incorrect order.
            require(leaf.index == leavesExecuted, "SphinxModule: invalid leaf index");
            // The current chain ID must match the leaf's chain ID, or the Merkle root must
            // be executable on an arbitrary chain.
            require(
                leaf.chainId == block.chainid || arbitraryChain,
                "SphinxModule: invalid chain id"
            );
            // If the Merkle root can be executable on an arbitrary chain, the leaf must have a chain ID
            // of 0. This isn't strictly necessary; it just enforces a convention.
            require(!arbitraryChain || leaf.chainId == 0, "SphinxModule: leaf chain id must be 0");

            // Decode the Merkle leaf's data.
            (
                address to,
                uint256 value,
                uint256 gas,
                bytes memory txData,
                Enum.Operation operation,
                bool requireIsContract
            ) = abi.decode(leaf.data, (address, uint256, uint256, bytes, Enum.Operation, bool));

            // If `requireIsContract` is `true`, check that the `to` field is a contract.
            require(!requireIsContract || to.code.length > 0, "TODO(docs)");

            leavesExecuted += 1;

            bool success = GnosisSafe(safeProxy).execTransactionFromModule(
                to,
                value,
                txData,
                operation
            );
            require(success, "TODO(docs)");

            emit SphinxActionSucceeded(cachedLatestMerkleRoot, leaf.index);
        }

        state.leavesExecuted = leavesExecuted;

        // Mark the Merkle root as completed if all of the Merkle leaves have been executed.
        if (leavesExecuted == state.numLeaves) {
            emit SphinxMerkleRootCompleted(cachedLatestMerkleRoot);
            state.status = MerkleRootStatus.COMPLETED;
        }
    }

    /**
     * @notice Hash a Merkle leaf. We do this before attempting to prove that the leaf
     *         belongs to a Merkle root. We double-hash the leaf to prevent second preimage attacks,
     *         as recommended by OpenZeppelin's Merkle Tree library.
     *
     * @param _leaf The Merkle leaf to hash.
     */
    function _getLeafHash(SphinxLeaf memory _leaf) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(_leaf))));
    }
}
