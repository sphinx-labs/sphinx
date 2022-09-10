# ChugSplashManager Speed Spec

## Bundle states

```typescript
enum BundleStatus {
  EMPTY,
  PROPOSED,
  APPROVED,
  CANCELLED,
  COMPLETED
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
      configUri,
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
* The balance of the ChugSplashManager minus the current `totalDebt` MUST be greater than `BUNDLE_EXECUTION_BOND_AMOUNT` ETH in its balance.
* The ChugSplashManager MUST emit the event ChugSplashBundleApproved with the ID of the bundle as the only parameter. The ChugSplashManager MUST announce this event to the registry.

## Cancelling a ChugSplash bundle

* A ChugSplash bundle MUST only be cancellable by the `admin` of the `ChugSplashManager`.
* Bundles MUST be in the `APPROVED` state before they can be cancelled.
* Cancelling a bundle MUST put the bundle in the `CANCELLED` state.
* Cancelling a bundle MUST remove the active bundle.
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
