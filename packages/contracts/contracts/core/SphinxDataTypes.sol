// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";

/**
 * @custom:value APPROVE Approve a new deployment on a chain. This leaf must be submitted in the
 *               `approve` function on the `SphinxModuleProxy`.
 * @custom:value EXECUTE Execute a transaction in the deployment. These leaves must be submitted in
 *               the `execute` function on the `SphinxModuleProxy`.
 */
enum SphinxLeafType {
    APPROVE,
    EXECUTE
}

/**
 * @notice A Merkle leaf.
 *
 * @custom:field chainId  The current chain ID.
 * @custom:field index    The index of the leaf within the Merkle tree on this chain.
 * @custom:field leafType The type of the leaf.
 * @custom:field data     Arbitrary data that is ABI encoded based on the leaf type.
 */
struct SphinxLeaf {
    uint256 chainId;
    uint256 index;
    SphinxLeafType leafType;
    bytes data;
}

/**
 * @custom:field leaf  A Merkle leaf.
 * @custom:field proof The Merkle leaf's proof.
 */
struct SphinxLeafWithProof {
    SphinxLeaf leaf;
    bytes32[] proof;
}

/**
 * @notice The deployment state that corresponds to a Merkle root.
 *
 * @custom:field numLeaves      The total number of leaves in the Merkle tree on the current chain.
 *                              There must be at least one leaf (the `APPROVE` leaf).
 * @custom:field leavesExecuted The number of Merkle leaves that have been executed on the current
 *                              chain for the current Merkle root.
 * @custom:field uri            An optional field that contains the URI of the deployment. Its
 *                              purpose is to provide a public record that allows anyone to
 *                              re-assemble the entire deployment from scratch. This may include the
 *                              Solidity compiler inputs, which are required for Etherscan
 *                              verification. The format, location, and contents of the URI are
 *                              determined by off-chain tooling.
 * @custom:field executor       The address of the caller, which is the only account that is allowed
 *                              to execute the deployment.
 * @custom:field status         The status of the deployment.
 * @custom:field arbitraryChain If this is `true`, the Merkle root can be executed on any chain
 *                              without the explicit permission of the Gnosis Safe owners. This is
 *                              useful if the owners want their system to be permissionlessly
 *                              deployed on new chains. By default, this is disabled, which means
 *                              that the Gnosis Safe owners must explicitly approve the deployment
 *                              on individual chains.
 */
struct DeploymentState {
    uint256 numLeaves;
    uint256 leavesExecuted;
    string uri;
    address executor;
    DeploymentStatus status;
    bool arbitraryChain;
}

/**
 * @notice Enum that represents the status of the deployment for a Merkle root.
 *
 * @custom:value EMPTY     The deployment does not exist.
 * @custom:value APPROVED  The Merkle root has been approved by the Gnosis Safe owners, and the
 *                         `approve` function has been called on the `SphinxModuleProxy`. This
 *                         Merkle root is now "active".
 * @custom:value COMPLETED The deployment has been completed on this network.
 * @custom:value CANCELED The deployment has been canceled by the Gnosis Safe owner(s).
 * @custom:value FAILED    The deployment has failed due to a transaction reverting in the Gnosis
 *                         Safe.
 */
enum DeploymentStatus {
    EMPTY,
    APPROVED,
    COMPLETED,
    CANCELED,
    FAILED
}
