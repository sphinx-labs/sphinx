// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SphinxManagerEvents {
    /**
     * @notice Emitted when a deployment is approved.

     * @param deploymentId   ID of the deployment that was approved.
     * @param actionRoot   Root of the Merkle tree containing the actions for the deployment.
     * @param targetRoot   Root of the Merkle tree containing the targets for the deployment.
     * @param numInitialActions   Number of initial `CALL` or `DEPLOY_CONTRACT` actions in the
       deployment, which must occur before an upgrade is initiated (if applicable).
     * @param numSetStorageActions   Number of `SET_STORAGE` actions in the deployment.
     * @param numTargets   Number of targets in the deployment.
     * @param configUri  URI of the config file that can be used to fetch the deployment.
     * @param remoteExecution Boolean indicating if the deployment should be remotely executed.
     * @param approver     Address of the account that approved the deployment.
     */
    event SphinxDeploymentApproved(
        bytes32 indexed deploymentId,
        bytes32 actionRoot,
        bytes32 targetRoot,
        uint256 numInitialActions,
        uint256 numSetStorageActions,
        uint256 numTargets,
        string configUri,
        bool remoteExecution,
        address approver
    );

    /**
     * @notice Emitted when a storage slot in a proxy is modified.
     *
     * @param deploymentId Current deployment ID.
     * @param proxy        Address of the proxy.
     * @param executor Address of the caller for this transaction.
     * @param actionIndex Index of this action.
     */
    event SetProxyStorage(
        bytes32 indexed deploymentId,
        address indexed proxy,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a deployment is initiated.
     *
     * @param deploymentId   ID of the active deployment.
     * @param executor        Address of the caller that initiated the deployment.
     */
    event ProxiesInitiated(bytes32 indexed deploymentId, address indexed executor);

    event ProxyUpgraded(bytes32 indexed deploymentId, address indexed proxy);

    /**
     * @notice Emitted when a deployment is completed.
     *
     * @param deploymentId   ID of the active deployment.
     * @param executor        Address of the caller that initiated the deployment.
     */
    event SphinxDeploymentCompleted(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when the owner of this contract cancels an active deployment.
     *
     * @param deploymentId        Deployment ID that was cancelled.
     * @param owner           Address of the owner that cancelled the deployment.
     * @param actionsExecuted Total number of completed actions before cancellation.
     */
    event SphinxDeploymentCancelled(
        bytes32 indexed deploymentId,
        address indexed owner,
        uint256 actionsExecuted
    );

    /**
     * @notice Emitted when ownership of a proxy is transferred away from this contract.
     *
     * @param proxy            Address of the proxy that was exported.
     * @param contractKindHash The proxy's contract kind hash, which indicates the proxy's type.
     * @param newOwner         Address of the new owner of the proxy.
     */
    event ProxyExported(address indexed proxy, bytes32 indexed contractKindHash, address newOwner);

    /**
     * @notice Emitted when a deployment is claimed by a remote executor.
     *
     * @param deploymentId ID of the deployment that was claimed.
     * @param executor Address of the executor that claimed the deployment.
     */
    event SphinxDeploymentClaimed(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when a contract is deployed by this contract.
     *
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param creationCodeWithArgsHash Hash of the creation code with constructor args.
     */
    event ContractDeployed(
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        bytes32 creationCodeWithArgsHash
    );

    /**
     * @notice Emitted when a `CALL` action is executed.
     *
     * @param deploymentId ID of the deployment in which the call was executed.
     * @param callHash     The ABI-encoded hash of the `to` field and the `data` field in the `CALL`
     *                     action.
     * @param actionIndex Index of the `CALL` action that was executed.
     */
    event CallExecuted(bytes32 indexed deploymentId, bytes32 indexed callHash, uint256 actionIndex);

    /**
     * @notice Emitted when a `CALL` action is skipped, which occurs if its nonce is incorrect.
     *
     * @param deploymentId ID of the deployment in which the call was skipped.
     * @param actionIndex Index of the `CALL` action that was skipped.
     */
    event CallSkipped(bytes32 indexed deploymentId, uint256 actionIndex);

    /**
     * @notice Emitted when a contract deployment is skipped. This occurs when a contract already
       exists at the Create3 address.
     *
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param actionIndex Index of the action that attempted to deploy the contract.
     */
    event ContractDeploymentSkipped(
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        uint256 actionIndex
    );
}
