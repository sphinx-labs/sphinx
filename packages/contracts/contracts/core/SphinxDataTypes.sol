// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";

/**
 * @custom:value APPROVE Approve a deployment. This must occur before a deployment can
 *               can be executed.
 * @custom:value EXECUTE Execute a transaction within a deployment.
 */
enum SphinxLeafType {
    APPROVE,
    EXECUTE
}

/**
 * @custom:field chainId  The current chain ID.
 * @custom:field index    The index of the leaf within the Merkle tree on this chain.
 * @custom:field leafType The type of the leaf.
 * @custom:field data     Arbitrary data to be decoded based on the leaf type.
 */
struct SphinxLeaf {
    uint256 chainId;
    uint256 index;
    SphinxLeafType leafType;
    bytes data;
}

struct SphinxTransaction {
    address to;
    uint256 value;
    bytes txData;
    Enum.Operation operation;
    uint256 gas;
    bool requireSuccess;
}

struct SphinxMerkleTree {
    bytes32 root;
    SphinxLeafWithProof[] leafs;
}

struct SphinxLeafWithProof {
    SphinxLeaf leaf;
    bytes32[] proof;
}

struct Result {
    bool success;
    bytes returnData;
}

struct DeploymentState {
    uint256 numLeafs;
    uint256 leafsExecuted;
    string uri;
    address executor;
    DeploymentStatus status;
}

/**
 * @notice Struct representing a Sphinx action.
 *
 * @custom:field actionType The type of action.
 * @custom:field index The unique index of the action in the deployment. Actions must be executed in
   ascending order according to their index.
 * @custom:field data The ABI-encoded data associated with the action.
 */
struct RawSphinxAction {
    SphinxActionType actionType;
    uint256 index;
    bytes data;
}

/**
 * @notice Struct representing a target.
 *
 * @custom:field addr The address of the proxy associated with this target.
 * @custom:field implementation The address that will be the proxy's implementation at the end of
   the deployment.
 * @custom:field contractKindHash The hash of the contract kind associated with this contract.
 */
struct SphinxTarget {
    address payable addr;
    address implementation;
    bytes32 contractKindHash;
}

/**
 * @notice Enum representing possible action types.
 *
 * @custom:value SET_STORAGE Set a storage slot value in a proxy contract.
 * @custom:value DEPLOY_CONTRACT Deploy a contract.
 * @custom:value CALL Execute a low-level call on an address.
 */
enum SphinxActionType {
    SET_STORAGE,
    DEPLOY_CONTRACT,
    CALL
}

/**
 * @notice Enum representing the status of the deployment. These steps occur in sequential order,
   with the `CANCELLED` status being an exception.
 *
 * @custom:value EMPTY The deployment does not exist.
 * @custom:value APPROVED The deployment has been approved by the Gnosis Safe owner(s).
 * @custom:value COMPLETED The deployment has been completed.
 * @custom:value CANCELLED The deployment has been cancelled by the Gnosis Safe owner(s).
 * @custom:value FAILED The deployment has failed due to a transaction reverting.
 */
enum DeploymentStatus {
    EMPTY,
    APPROVED,
    COMPLETED,
    CANCELLED,
    FAILED
}

/**
 * @notice Version number as a struct.
 *
 * @custom:field major Major version number.
 * @custom:field minor Minor version number.
 * @custom:field patch Patch version number.
 */
struct Version {
    uint256 major;
    uint256 minor;
    uint256 patch;
}

struct RegistrationInfo {
    Version version;
    address owner;
    bytes managerInitializerData;
}

/**
 * @notice Struct representing a leaf in an auth Merkle tree. This represents an arbitrary
   authenticated action taken by a permissioned account such as an owner or proposer.
 *
 * @custom:field chainId The chain ID for the leaf to be executed on.
 * @custom:field to The address that is the subject of the data in this leaf. This should always be
                 a SphinxManager.
 * @custom:field index The index of the leaf. Each index must be unique on a chain, and start from
                 zero. Leafs must be executed in ascending order according to their index. This
                 makes it possible to ensure that leafs in an Auth tree will be executed in a
                 certain order, e.g. creating a proposal then approving it.
 */
struct AuthLeaf {
    uint256 chainId;
    address to;
    uint256 index;
    bytes data;
}

/**
 * @notice Struct representing the state of an auth Merkle tree.
 *
 * @custom:field status The status of the auth Merkle tree.
 * @custom:field leafsExecuted The number of auth leafs that have been executed.
 * @custom:field numLeafs The total number of leafs in the auth Merkle tree on a chain.
 */
struct AuthState {
    AuthStatus status;
    uint256 leafsExecuted;
    uint256 numLeafs;
}

enum AuthStatus {
    EMPTY,
    SETUP,
    PROPOSED,
    COMPLETED
}

struct SetRoleMember {
    address member;
    bool add;
}

struct DeploymentApproval {
    bytes32 actionRoot;
    bytes32 targetRoot;
    uint256 numInitialActions;
    uint256 numSetStorageActions;
    uint256 numTargets;
    string configUri;
    bool remoteExecution;
}

enum AuthLeafType {
    SETUP,
    PROPOSE,
    EXPORT_PROXY,
    SET_OWNER,
    SET_THRESHOLD,
    TRANSFER_MANAGER_OWNERSHIP,
    UPGRADE_MANAGER_IMPLEMENTATION,
    UPGRADE_AUTH_IMPLEMENTATION,
    UPGRADE_MANAGER_AND_AUTH_IMPL,
    SET_PROPOSER,
    APPROVE_DEPLOYMENT,
    CANCEL_ACTIVE_DEPLOYMENT
}
