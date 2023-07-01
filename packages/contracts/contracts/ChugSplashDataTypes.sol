// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

/**
 * @notice Struct representing the state of a deployment.
 *
 * @custom:field projectName The name of the project.
 * @custom:field status The status of the deployment.
 * @custom:field actions An array of booleans representing whether or not an action has been
   executed.
 * @custom:field targets The number of targets in the deployment.
 * @custom:field actionRoot The root of the Merkle tree of actions.
 * @custom:field targetRoot The root of the Merkle tree of targets.
 * @custom:field numImmutableContracts The number of non-proxy contracts in the deployment.
 * @custom:field actionsExecuted The number of actions that have been executed so far in the
   deployment.
 * @custom:field timeClaimed The time at which the deployment was claimed by a remote executor.
 * @custom:field selectedExecutor The address of the selected remote executor.
 * @custom:field remoteExecution Whether or not the deployment is being executed remotely.
 * @custom:field configUri URI pointing to the config file for the deployment.
 */
struct DeploymentState {
    string projectName;
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
}

/**
 * @notice Struct representing a ChugSplash action.
 *
 * @custom:field actionType The type of action.
 * @custom:field data The ABI-encoded data associated with the action.
 * @custom:field addr The address of the contract to which the action applies.
 * @custom:field contractKindHash The hash of the contract kind associated with this contract.
 * @custom:field referenceName The reference name associated with the contract.
 */
struct RawChugSplashAction {
    ChugSplashActionType actionType;
    bytes data;
    address payable addr;
    bytes32 contractKindHash;
    string referenceName;
}

/**
 * @notice Struct representing a target.
 *
 * @custom:field referenceName The reference name associated with the target.
 * @custom:field addr The address of the proxy associated with this target.
 * @custom:field implementation The address that will be the proxy's implementation at the end of
   the deployment.
 * @custom:field contractKindHash The hash of the contract kind associated with this contract.
 */
struct ChugSplashTarget {
    string referenceName;
    address payable addr;
    address implementation;
    bytes32 contractKindHash;
}

/**
 * @notice Struct representing a cross-chain funding message.
 *
 * @custom:field The destination chain id.
 * @custom:field The endpoint outbound proof type.
 * @custom:field The contract receiving the message.
 * @custom:field The address receiving the airdrop.
 * @custom:field The amount to airdrop.
 * @custom:field Whether to pay with ZRO (layer zero token), will cause revert if true.
 * @custom:field The message payload.
 */
struct FunderAction {
    uint16 dstChainId;
    uint16 outboundProofType;
    address receiverAddress;
    address airdropAddress;
    uint airdropAmount;
    bool payInZRO;
    bytes payload;
}

/**
 * @notice Enum representing possible action types.
 *
 * @custom:value SET_STORAGE Set a storage slot value in a proxy contract.
 * @custom:value DEPLOY_CONTRACT Deploy a contract.
 */
enum ChugSplashActionType {
    SET_STORAGE,
    DEPLOY_CONTRACT
}

/**
 * @notice Enum representing the status of the deployment. These steps occur in sequential order,
   with the `CANCELLED` status being an exception.
 *
 * @custom:value EMPTY The deployment does not exist.
 * @custom:value APPROVED The deployment has been approved by the owner.
 * @custom:value PROXIES_INITIATED The proxies in the deployment have been initiated.
 * @custom:value COMPLETED The deployment has been completed.
 * @custom:value CANCELLED The deployment has been cancelled.
 * @custom:value FAILED The deployment has failed.
 */
enum DeploymentStatus {
    EMPTY,
    APPROVED,
    PROXIES_INITIATED,
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

struct ChugSplashBundles {
    ChugSplashActionBundle actionBundle;
    ChugSplashTargetBundle targetBundle;
}

struct ChugSplashActionBundle {
    bytes32 root;
    BundledChugSplashAction[] actions;
}

struct ChugSplashTargetBundle {
    bytes32 root;
    BundledChugSplashTarget[] targets;
}

struct BundledChugSplashAction {
    RawChugSplashAction action;
    ActionProof proof;
}

struct BundledChugSplashTarget {
    ChugSplashTarget target;
    bytes32[] siblings;
}

struct ActionProof {
    uint256 actionIndex;
    bytes32[] siblings;
}

struct ForwardRequest {
    uint256 chainId;
    address from;
    address to;
    uint256 nonce;
    bytes data;
}

struct ContractInfo {
    string referenceName;
    address addr;
}

struct AuthState {
    AuthStatus status;
    uint256 actionsExecuted;
    uint256 numActions;
    uint256 numLeafs;
}

enum AuthStatus {
    EMPTY,
    PROPOSED,
    COMPLETED
}
