# ChugSplashManager Speed Spec

## Bundle states

```typescript
enum ActionType {
  SET_CODE,
  SET_STORAGE
}
```

```typescript
enum BundleStatus {
  EMPTY,
  PROPOSED,
  APPROVED,
  CANCELLED,
  COMPLETED
}
```

```typescript
struct BundleState {
  BundleStatus status;
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

## Computing a unique bundle ID

```typescript
const computeBundleId = (
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
  bundleId: bytes32
): address => {
  return bundles[bundleId].selectedExecutor
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
* Proposing a bundle puts the bundle in the `PROPOSED` state.
* The ChugSplashManager MUST emit the event ChugSplashBundleProposed with the ID of the bundle, the bundle root, the bundle size, and the config URI as parameters. The ChugSplashManager MUST announce this event to the registry.

## Approving a ChugSplash bundle

* A ChugSplash bundle MUST only be approvable by the `admin` of the `ChugSplashManager`.
* Bundles MUST have be in the `PROPOSED` state before they can be approved.
* There MUST NOT be any active bundle.
* Approving a bundle MUST put the bundle in the `APPROVED` state.
* Approving a bundle MUST make the approved bundle the active bundle.
* The balance of the ChugSplashManager minus the current totalDebt MUST be greater than BUNDLE_EXECUTION_BOND_AMOUNT ETH in its balance.
* The ChugSplashManager MUST emit the event ChugSplashBundleApproved with the ID of the bundle as the only parameter. The ChugSplashManager MUST announce this event to the registry.

## Executing a ChugSplash action
* There MUST be an `activeBundleId` to execute a ChugSplash action.
* There MUST be enough reserved ETH in the ChugSplashManager to pay the executor for this action.
* The `_actionIndex` MUST NOT already have been executed.
* A ChugSplash action MUST be executed by the `selectedExecutor`.
* The `_action`, `activeBundleId`, `_actionIndex`, and `_proof` MUST produce a valid Merkle proof.
* If the proxy corresponding to the `target` has not already been deployed:
  * The proxy MUST be deployed using Create2.
  * The proxy MUST have the same address as the the address returned by a call to `getProxyByName`.
* A `SET_CODE` or `SET_ACTION` MUST be executed on the proxy depending on the `ActionType`.
* Executing an action MUST increment the `actionsExecuted` by one.
* Executing an action MUST set the current `_actionIndex` to `true`.
* The ChugSplashManager MUST emit the event ChugSplashActionExecuted with the active bundle ID, the executor's address, and the action index. The ChugSplashManager MUST announce this event to the registry.
* If all actions have been executed for the bundle:
  * The bundle status MUST be set to `COMPLETED`.
  * The ChugSplashManager MUST increase the `debt` owed to the current executor by the `executorBondAmount`.
  * The `activeBundleId` MUST be set to `bytes32(0)`.
  * The ChugSplashManager MUST emit the event ChugSplashBundleCompleted with the active bundle ID, the executor's address, and the action index. The ChugSplashManager MUST announce this event to the registry.
* Executing an action MUST increase the `totalDebt` and the current executor's `debt` by `block.basefee * gasUsed * (100 + executorPaymentPercentage) / 100)`, where `gasUsed` is calculated using `gasleft()` plus the intrinsic gas (21k) plus the calldata usage.

## Cancelling a ChugSplash bundle

* A ChugSplash bundle MUST only be cancellable by the `admin` of the `ChugSplashManager`.
* Bundles MUST be in the `APPROVED` state before they can be cancelled.
* Cancelling a bundle MUST put the bundle in the `CANCELLED` state.
* Cancelling a bundle MUST remove the active bundle.
* If an executor has been selected within the last `executionLockTime` seconds (i.e. `block.timestamp` <= `timeClaimed + executionLockTime`):
  * The ChugSplashManager MUST increase the `debt` owed to the current executor by `BUNDLE_EXECUTION_BOND_AMOUNT`.
  * The ChugSplashManager MUST increase the `totalDebt` by the `BUNDLE_EXECUTION_BOND_AMOUNT`.
* The ChugSplashManager MUST emit the event ChugSplashBundleCancelled with the ID of the bundle and the total number of actions executed. The ChugSplashManager MUST announce this event to the registry.

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
* The `msg.value` MUST be greater than or equal to the `executorBondAmount`.
* The bundle being claimed MUST have an `APPROVED` status.
* The current `block.timestamp` MUST be greater than the `timeClaimed` plus the `executionLockTime`.
* Claiming a bundle MUST set the `timeClaimed` to be the `block.timestamp`.
* Claiming a bundle MUST set the `selectedExecutor` to be the executor that claimed the bundle.
* If there was no previously selected executor for this bundle:
  * The ChugSplashManager MUST increase the `totalDebt` by the `executorBondAmount`.
* The ChugSplashManager MUST emit the event ChugSplashBundleClaimed with the claimed bundle ID and the address of the executor. The ChugSplashManager MUST announce this event to the registry.

## Transferring proxy ownership from the ChugSplashManager

* The `admin` of the `ChugSplashManager` MUST be the only address that can transfer proxy ownership from the ChugSplashManager.
* There MUST NOT be an active bundle ID.
* The delegatecall to transfer proxy ownership MUST succeed.
* The ChugSplashManager MUST emit the ProxyOwnershipTransferred event with the name of the target corresponding to the proxy (indexed and unindexed), the address of the proxy, and the new owner of the proxy. The ChugSplashManager MUST announce this event to the registry.