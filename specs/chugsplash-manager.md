# ChugSplashManager Speed Spec

## Deployment states

```typescript
enum ActionType {
  SET_STORAGE,
  DEPLOY_CONTRACT
}
```

```typescript
enum DeploymentStatus {
  EMPTY,
  PROPOSED,
  APPROVED,
  CANCELLED,
  COMPLETED
}
```

```typescript
struct DeploymentState {
  DeploymentStatus status;
  bool[] executions;
  uint256 actionsExecuted;
  uint256 timeClaimed;
  address selectedExecutor;
}
```

```typescript
struct Action {
  string target;
  ActionType actionType;
  bytes code;
}
```

## Computing a unique deployment ID

```typescript
const computeDeploymentId = (
  bundleRoot: bytes32,
  bundleSize: uint256,
  configUri: string
): bytes => {
  return keccak256(
    abi.encode(
      bundleRoot,
      bundleSize,
      configUri
    )
  )
}
```

## Getting the selected executor

```typescript
const getSelectedExecutor = (
  deploymentId: bytes32
): address => {
  return bundles[deploymentId].selectedExecutor
}
```

## Getting the proxy by name

```typescript
const getProxyByName = (
  name: string
): address payable => {
  return (
    payable(
      Create2.compute(address(this), keccak256(bytes(name)), type(Proxy).creationCode)
    )
  )
}
```

## Proposing a ChugSplash bundle

* A ChugSplash bundle MUST only be proposable by the `admin` of the `ChugSplashManager`.
* Bundles MUST be in the `EMPTY` state before they can be proposed.
* Proposing a bundle puts the deployment in the `PROPOSED` state.
* The ChugSplashManager MUST emit the event ChugSplashDeploymentProposed with the ID of the deployment, the bundle root, the deployment size, and the config URI as parameters. The ChugSplashManager MUST announce this event to the registry.

## Approving a ChugSplash bundle

* A ChugSplash bundle MUST only be approvable by the `admin` of the `ChugSplashManager`.
* Bundles MUST have be in the `PROPOSED` state before they can be approved.
* There MUST NOT be any active bundle.
* Approving a bundle MUST put the deployment in the `APPROVED` state.
* Approving a bundle MUST make the approved deployment the active bundle.
* The balance of the ChugSplashManager minus the current `totalDebt` MUST be greater than or equal to OWNER_BOND_AMOUNT ETH in its balance.
* The ChugSplashManager MUST emit the event ChugSplashDeploymentApproved with the ID of the deployment as the only parameter. The ChugSplashManager MUST announce this event to the registry.

## Executing a ChugSplash action
* There MUST be an `activeDeploymentId` to execute a ChugSplash action.
* The `_actionIndex` MUST NOT already have been executed.
* A ChugSplash action MUST be executed by the `selectedExecutor`.
* The `_action`, `activeDeploymentId`, `_actionIndex`, and `_proof` MUST produce a valid Merkle proof.
* If the proxy corresponding to the `target` has not already been deployed:
  * The proxy MUST be deployed using Create2.
  * The proxy MUST have the same address as the the address returned by a call to `getProxyByTargetName`.
* Otherwise, if the proxy's implementation is not `address(0)`:
  * The proxy's implementation MUST be set to `address(0)`.
* The `actionsExecuted` MUST be incremented by one.
* The current `_actionIndex` MUST be set to `true`.
* If the current action is `SET_STORAGE`:
  * A call to `_setProxyStorage` MUST be executed with the `proxy`, `contractKind`, `key`, and `val` as arguments.
* Otherwise, if the current action is `DEPLOY_IMPLEMENTATION`:
  * A call to `_deployImplementation` MUST be executed with `proxy`, `contractKind`, and `data` as arguments.
* Otherwise, the current call MUST revert.
* The ChugSplashManager MUST emit the event SetProxyStorage with the active deployment ID, the executor's address, and the action index.
* The ChugSplashManager MUST announce this event to the registry.
* Executing an action MUST increase the `totalDebt` and the current executor's `debt` by `block.basefee * gasUsed * (100 + executorPaymentPercentage) / 100)`, where `gasUsed` is calculated using `gasleft()` plus the intrinsic gas (21k) plus the calldata usage.

## Completing a ChugSplash bundle
* There MUST be an `activeDeploymentId`.
* The actions MUST be executed by the `selectedExecutor`.
* For each `_action` in `_actions`:
  * The `_actionIndex` MUST NOT already have been executed.
  * The `_action`, `activeDeploymentId`, `_actionIndex`, and `_proof` MUST produce a valid Merkle proof.
  * The `actionsExecuted` MUST be incremented by one.
  * The current `_actionIndex` MUST be set to `true`.
  * A call to `_upgradeProxyTo` MUST be executed with the corresponding `proxy`, `adapter`, and `implementation` as arguments.
  * The ChugSplashManager MUST increase the current executor's `debt` and the `totalDebt` by `block.basefee * gasUsed * (100 + executorPaymentPercentage) / 100)`, where `gasUsed` is calculated using `gasleft()` plus the intrinsic gas (21k) plus the calldata usage.
  * The ChugSplashManager MUST emit the event SetProxyStorage with the active deployment ID, the executor's address, and the action index.
  * The ChugSplashManager MUST announce this event to the registry.
* The call MUST revert if all of the actions in the deployment were not executed.
* The deployment status MUST be set to `COMPLETED`.
* The `activeDeploymentId` MUST be set to `bytes32(0)`.
* The ChugSplashManager MUST increase the `debt` owed to the current executor by the `EXECUTOR_BOND_AMOUNT`.
* The ChugSplashManager MUST emit the event ChugSplashDeploymentCompleted with the active deployment ID, the executor's address, and the action index.
* The ChugSplashManager MUST announce this event to the registry.

## Cancelling a ChugSplash bundle

* A ChugSplash bundle MUST only be cancellable by the `admin` of the `ChugSplashManager`.
* Bundles MUST be in the `APPROVED` state before they can be cancelled.
* Cancelling a bundle MUST put the deployment in the `CANCELLED` state.
* Cancelling a bundle MUST remove the active bundle.
* If an executor has been selected within the last `EXECUTION_LOCK_TIME` seconds (i.e. `block.timestamp` <= `timeClaimed + EXECUTION_LOCK_TIME`):
  * The ChugSplashManager MUST increase the `debt` owed to the current executor by `OWNER_BOND_AMOUNT + EXECUTOR_BOND_AMOUNT`.
  * The ChugSplashManager MUST increase the `totalDebt` by the `OWNER_BOND_AMOUNT`.
* Otherwise, the `totalDebt` must decrease by the `EXECUTOR_BOND_AMOUNT`.
* The ChugSplashManager MUST emit the event ChugSplashBundleCancelled with the ID of the deployment and the total number of actions executed. The ChugSplashManager MUST announce this event to the registry.

## Withdrawing ETH

* ETH stored in the contract MUST only be withdrawable by the `admin` of the `ChugSplashManager`.
* The admin ETH withdrawal function MUST NOT be callable while a bundle is in the `APPROVED` state.
* The admin ETH withdrawal function MUST only allow the admin to withdraw the balance of the account minus `totalDebt`.
* The ChugSplashManager MUST emit the ETHWithdrawn event with the recipient and the amount. The ChugSplashManager MUST announce this event to the registry.

## Claiming executor payments

* Executors MUST be able to claim payments at any time.
* Executors MUST NOT be able to claim more payments than their `debt` amount.
* The ChugSplashManager MUST update the `debt` and `totalDebt` values to reflect the payment.
* The ChugSplashManager MUST emit the ExecutorPayment event with the recipient and amount. The ChugSplashManager MUST announce this event to the registry.

## Depositing ETH

* Any address should be able to deposit ETH into the `ChugSplashManager` contract at any time.

## Claiming a bundle

* Anyone should be able to claim a bundle.
* The `msg.value` MUST be greater than or equal to the `EXECUTOR_BOND_AMOUNT`.
* The bundle being claimed MUST have an `APPROVED` status.
* The current `block.timestamp` MUST be greater than the `timeClaimed` plus the `EXECUTION_LOCK_TIME`.
* Claiming a bundle MUST set the `timeClaimed` to be the `block.timestamp`.
* Claiming a bundle MUST set the `selectedExecutor` to be the executor that claimed the deployment.
* If there was no previously selected executor for this bundle:
  * The ChugSplashManager MUST increase the `totalDebt` by the `EXECUTOR_BOND_AMOUNT`.
* The ChugSplashManager MUST emit the event ChugSplashBundleClaimed with the claimed deployment ID and the address of the executor. The ChugSplashManager MUST announce this event to the registry.

## Transferring proxy ownership from the ChugSplashManager

* The `admin` of the `ChugSplashManager` MUST be the only address that can transfer proxy ownership from the ChugSplashManager.
* There MUST NOT be an active deployment ID.
* The delegatecall to transfer proxy ownership MUST succeed.
* The ChugSplashManager MUST emit the ProxyExported event with the name of the target corresponding to the proxy (indexed and unindexed), the address of the proxy, and the new owner of the proxy. The ChugSplashManager MUST announce this event to the registry.
