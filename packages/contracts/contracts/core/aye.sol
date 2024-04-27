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
    MerkleRootStatus,
    PreconditionResult
} from "./SphinxDataTypes.sol";
import { ISphinxModule } from "./interfaces/ISphinxModule.sol";
import { IPreconditionChecker } from "./interfaces/IPreconditionChecker.sol";

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
contract SphinxModule is ReentrancyGuard, Enum, Initializable {

    string public constant VERSION = "1.0.0";

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


    mapping(bytes32 => MerkleRootState) public merkleRootStates;


    uint256 public merkleRootNonce;


    bytes32 public activeMerkleRoot;


    address payable public safeProxy;

    /**
     * @notice Locks the `SphinxModule` implementation contract so it can't be
     *         initialized directly.
     */
    constructor() {
        _disableInitializers();
    }


    function initialize(address _safeProxy) external initializer {
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

    function execute(
        bytes32 _root,
        SphinxLeafWithProof[] memory _leavesWithProofs,
        bytes memory _signatures
    ) public {
        uint256 numActions = _leavesWithProofs.length;
        require(numActions > 0, "SphinxModule: no leaves to execute");

        require(_root != bytes32(0), "SphinxModule: invalid root");

        MerkleRootState storage state = merkleRootStates[_root];

        // Cache the `leavesExecuted` state variable to reduce the number of SLOADs in this call.
        uint256 leavesExecuted = state.leavesExecuted;

        SphinxLeaf memory leaf;
        bytes32[] memory proof;
        // Iterate through each of the Merkle leaves in the array.
        for (uint256 i = 0; i < numActions; i++) {
            leaf = _leavesWithProofs[i].leaf;
            proof = _leavesWithProofs[i].proof;

            (
                address to,
                uint256 value,
                bytes memory txData,
                Enum.Operation operation,
                address executor,
                address preconditionChecker,
                bytes memory preconditionData,
                bool arbitraryChain,
                bytes memory extraData
            ) = abi.decode(leaf.data, (address, uint256, bytes, Enum.Operation, address, address, bytes, bool, bytes));

            if (leaf.index == 0) {
                (
                    bytes32 previousMerkleRoot,
                    uint256 previousLeavesExecuted,
                    address leafSafeProxy,
                    address moduleProxy,
                    string memory uri
                ) = abi.decode(extraData, (bytes32, uint256, address, address, string));

                require(leafSafeProxy == address(safeProxy), "SphinxModule: invalid SafeProxy");
                require(moduleProxy == address(this), "SphinxModule: invalid SphinxModuleProxy");

                require(previousMerkleRoot == activeMerkleRoot, "TODO(docs)");
                require(merkleRootStates[activeMerkleRoot].leavesExecuted == previousLeavesExecuted, "TODO(docs0)");

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

                state.uri = uri;

                activeMerkleRoot = _root;
            }

            require(executor == msg.sender, "SphinxModule: caller isn't executor");

            require(
                MerkleProof.verify(proof, activeMerkleRoot, _getLeafHash(leaf)),
                "SphinxModule: failed to verify leaf"
            );

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

            leavesExecuted += 1;

            PreconditionResult preconditionResult = IPreconditionChecker(preconditionChecker).check(preconditionData);
            require(preconditionResult != PreconditionResult.REVERT, "TODO(docs)");

            if (preconditionResult == PreconditionResult.EXECUTE) {
                bool success = GnosisSafe(safeProxy).execTransactionFromModule(
                    to,
                    value,
                    txData,
                    operation
                );
                require(success, "TODO(docs)");
            }
        }

        state.leavesExecuted = leavesExecuted;
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
