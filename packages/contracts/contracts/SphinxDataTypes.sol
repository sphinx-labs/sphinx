// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

/**
 * @notice Struct representing the state of a deployment.
 *
 * @custom:field status The status of the deployment.
 * @custom:field actions An array of actions in the deployment. This is a legacy field that should
   not be used.
 * @custom:field numInitialActions The number of initial actions in the deployment, which are either
 *               `CALL` or `DEPLOY_CONTRACT` actions.
 * @custom:field numSetStorageActions The number of `SET_STORAGE` actions in the deployment.
 * @custom:field targets The number of targets in the deployment.
 * @custom:field actionRoot The root of the Merkle tree of actions.
 * @custom:field targetRoot The root of the Merkle tree of targets.
 * @custom:field numImmutableContracts The number of immutable contracts in the deployment. This is
   a legacy field that should not be used.
 * @custom:field actionsExecuted The number of actions that have been executed so far in the
   deployment.
 * @custom:field timeClaimed The time at which the deployment was claimed by a remote executor.
 * @custom:field selectedExecutor The address of the selected remote executor.
 * @custom:field remoteExecution Whether or not the deployment is being executed remotely.
 * @custom:field configUri URI pointing to the config file for the deployment.
 */
struct DeploymentState {
    DeploymentStatus status;
    bool[] actions;
    uint256 targets;
    bytes32 actionRoot;
    bytes32 targetRoot;
    uint256 numImmutableContracts;
    uint256 actionsExecuted;
    uint256 timeClaimed;
    address selectedExecutor;
    bool remoteExecution;
    string configUri;
    uint256 numInitialActions;
    uint256 numSetStorageActions;
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
 * @custom:value DEFINE_CONTRACT TODO(docs)
 */
enum SphinxActionType {
    SET_STORAGE,
    DEPLOY_CONTRACT,
    CALL,
    DEFINE_CONTRACT
}

/**
 * @notice Enum representing the status of the deployment. These steps occur in sequential order,
   with the `CANCELLED` status being an exception.
 *
 * @custom:value EMPTY The deployment does not exist.
 * @custom:value APPROVED The deployment has been approved by the owner.
 * @custom:value INITIAL_ACTIONS_EXECUTED The initial `DEPLOY_CONTRACT` and `CALL` actions in the
   deployment have been executed.
 * @custom:value PROXIES_INITIATED The proxies in the deployment have been initiated.
 * @custom:value SET_STORAGE_ACTIONS_EXECUTED The `SET_STORAGE` actions in the deployment have been
                 executed.
 * @custom:value COMPLETED The deployment has been completed.
 * @custom:value CANCELLED The deployment has been cancelled.
 * @custom:value FAILED The deployment has failed. This is deprecated as we no longer allow
 *               deployments to silently fail.
 */
enum DeploymentStatus {
    EMPTY,
    APPROVED,
    PROXIES_INITIATED,
    COMPLETED,
    CANCELLED,
    FAILED,
    INITIAL_ACTIONS_EXECUTED,
    SET_STORAGE_ACTIONS_EXECUTED
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
    bytes data;
    uint256 index;
    address to;
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
