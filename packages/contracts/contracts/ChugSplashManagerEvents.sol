// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChugSplashManagerEvents {
    /**
     * @notice Emitted when a deployment is proposed.

     * @param deploymentId   ID of the deployment that was proposed.
     * @param actionRoot   Root of the Merkle tree containing the actions for the deployment.
     * @param targetRoot   Root of the Merkle tree containing the targets for the deployment.
     * @param numActions   Number of actions in the deployment.
     * @param numTargets   Number of targets in the deployment.
     * @param numImmutableContracts   Number of non-proxy contracts in the deployment.
     * @param configUri  URI of the config file that can be used to fetch the deployment.
     * @param remoteExecution Boolean indicating if the deployment should be remotely executed.
     * @param proposer     Address of the account that proposed the deployment.
     */
    event ChugSplashDeploymentProposed(
        bytes32 indexed deploymentId,
        bytes32 actionRoot,
        bytes32 targetRoot,
        uint256 numActions,
        uint256 numTargets,
        uint256 numImmutableContracts,
        string configUri,
        bool remoteExecution,
        address proposer
    );

    /**
     * @notice Emitted when a ChugSplash deployment is approved.
     *
     * @param deploymentId ID of the deployment that was approved.
     */
    event ChugSplashDeploymentApproved(bytes32 indexed deploymentId);

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

    event ProxyUpgraded(
        bytes32 indexed deploymentId,
        address indexed proxy,
        string projectName,
        string referenceName
    );

    /**
     * @notice Emitted when a deployment is completed.
     *
     * @param deploymentId   ID of the active deployment.
     * @param executor        Address of the caller that initiated the deployment.
     */
    event ChugSplashDeploymentCompleted(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when the owner of this contract cancels an active deployment.
     *
     * @param deploymentId        Deployment ID that was cancelled.
     * @param owner           Address of the owner that cancelled the deployment.
     * @param actionsExecuted Total number of completed actions before cancellation.
     */
    event ChugSplashDeploymentCancelled(
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
    event ChugSplashDeploymentClaimed(bytes32 indexed deploymentId, address indexed executor);

    /**
     * @notice Emitted when an executor claims a payment.
     *
     * @param executor The executor being paid.
     * @param withdrawn   Amount of ETH withdrawn.
     * @param remaining  Amount of ETH remaining to be withdrawn by the executor.
     */
    event ExecutorPaymentClaimed(address indexed executor, uint256 withdrawn, uint256 remaining);

    /**
     * @notice Emitted when the owner withdraws ETH from this contract.
     *
     * @param owner  Address of the owner.
     * @param amount ETH amount withdrawn.
     */
    event OwnerWithdrewETH(address indexed owner, uint256 amount);

    /**
     * @notice Emitted when the owner of this contract adds or removes a proposer.
     *
     * @param proposer Address of the proposer that was added or removed.
     * @param isProposer Boolean indicating if the proposer was added or removed.
     * @param owner Address of the owner.
     */
    event ProposerSet(address indexed proposer, bool indexed isProposer, address indexed owner);

    /**
     * @notice Emitted when the owner of this contract toggles the ability of the ManagedService
       contract to propose deployments.
     *
        * @param isManaged Boolean indicating if the ManagedService contract is allowed to propose
          deployments.
        * @param owner Address of the owner.
     */
    event ToggledManagedProposals(bool isManaged, address indexed owner);

    /**
     * @notice Emitted when ETH is deposited in this contract.
     *
     * @param from   Address of the account that deposited ETH.
     * @param amount ETH amount deposited.
     */
    event ETHDeposited(address indexed from, uint256 indexed amount);

    /**
     * @notice Emitted when a contract is deployed by this contract.
     *
     * @param referenceNameHash Hash of the reference name that corresponds to this contract.
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param referenceName     String reference name.
     * @param contractKindHash Hash of the contract kind.
     * @param creationCodeWithArgsHash Hash of the creation code with constructor args.
     */
    event ContractDeployed(
        string indexed referenceNameHash,
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        string referenceName,
        bytes32 contractKindHash,
        bytes32 creationCodeWithArgsHash
    );

    /**
     * @notice Emitted when a contract deployment is skipped. This occurs when a contract already
       exists at the Create3 address.
     *
     * @param referenceNameHash Hash of the reference name that corresponds to this contract.
     * @param contractAddress   Address of the deployed contract.
     * @param deploymentId          ID of the deployment in which the contract was deployed.
     * @param referenceName     String reference name.
     * @param actionIndex Index of the action that attempted to deploy the contract.
     */
    event ContractDeploymentSkipped(
        string indexed referenceNameHash,
        address indexed contractAddress,
        bytes32 indexed deploymentId,
        string referenceName,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a deployment fails. This should only occur if the constructor of a
       deployed contract reverts.
     *
     * @param referenceNameHash Hash of the reference name that corresponds to this contract.
     * @param expectedAddress   Expected Create3 address of the contract.
     * @param deploymentId      ID of the deployment in which the contract deployment was attempted.
     * @param referenceName     String reference name.
     * @param actionIndex Index of the action that attempted to deploy the contract.
     */
    event DeploymentFailed(
        string indexed referenceNameHash,
        address indexed expectedAddress,
        bytes32 indexed deploymentId,
        string referenceName,
        uint256 actionIndex
    );
}
