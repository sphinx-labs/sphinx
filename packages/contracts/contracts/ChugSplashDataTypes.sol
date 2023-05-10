// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Version } from "./Semver.sol";

/**
 * @notice Struct representing the state of a deployment.
 *
 * @custom:field status The status of the deployment.
 * @custom:field actions An array of booleans representing whether or not an action has been
   executed.
 * @custom:field targets The number of targets in the deployment.
 * @custom:field actionRoot The root of the Merkle tree of actions.
 * @custom:field targetRoot The root of the Merkle tree of targets.
 * @custom:field numNonProxyContracts The number of non-proxy contracts in the deployment.
 * @custom:field actionsExecuted The number of actions that have been executed so far in the
   deployment.
 * @custom:field timeClaimed The time at which the deployment was claimed by a remote executor.
 * @custom:field selectedExecutor The address of the selected remote executor.
 * @custom:field remoteExecution Whether or not the deployment is being executed remotely.
 */
struct DeploymentState {
    DeploymentStatus status;
    bool[] actions;
    uint256 targets;
    bytes32 actionRoot;
    bytes32 targetRoot;
    uint256 numNonProxyContracts;
    uint256 actionsExecuted;
    uint256 timeClaimed;
    address selectedExecutor;
    bool remoteExecution;
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
struct ChugSplashAction {
    ChugSplashActionType actionType;
    bytes data;
    address payable addr;
    bytes32 contractKindHash;
    string referenceName;
}

/**
 * @notice Struct representing a target.
 *
 * @custom:field projectName The name of the project associated with the target.
 * @custom:field referenceName The reference name associated with the target.
 * @custom:field addr The address of the proxy associated with this target.
 * @custom:field implementation The address that will be the proxy's implementation at the end of
   the deployment.
 * @custom:field contractKindHash The hash of the contract kind associated with this contract.
 */
struct ChugSplashTarget {
    string projectName;
    string referenceName;
    address payable addr;
    address implementation;
    bytes32 contractKindHash;
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
 * @custom:value PROPOSED The deployment has been proposed.
 * @custom:value APPROVED The deployment has been approved by the owner.
 * @custom:value PROXIES_INITIATED The proxies in the deployment have been initiated.
 * @custom:value COMPLETED The deployment has been completed.
 * @custom:value CANCELLED The deployment has been cancelled.
 * @custom:value FAILED The deployment has failed.
 */
enum DeploymentStatus {
    EMPTY,
    PROPOSED,
    APPROVED,
    PROXIES_INITIATED,
    COMPLETED,
    CANCELLED,
    FAILED
}

struct CrossChainMessageInfo {
    address payable originEndpoint;
    uint32 destDomainID;
    uint256 relayerFee;
}

struct RegistrationInfo {
    Version version;
    address owner;
    bytes managerInitializerData;
}
