# MyContract1
## Moonbase Alpha (technically Moonbeam by accident)
`eth_estimateGas`: 1064189 (~45k more gas than `gasUsed`)
`gasUsed`: 1018578 (txn hash: 0x9ad495358c017864a44e181f0fb3586dd825165bca9bb69fd655337094473af2)
## Sepolia
`eth_estimateGas`: 642798
`gasUsed`: 636579

# MyContract1FactoryOne
## Moonbase Alpha
`MyContract1Factory.gasUsed()`: 634156n
## Sepolia
`MyContract1Factory.gasUsed()`: 634156n

# Kevin's Bug Deployment Config (`DCAHubCompanion`)
## Moonbeam
Merkle leaf `gas`: 5112926
## Gnosis
Merkle leaf `gas`: 5077769
## Notes
* I think the Merkle leaf gas is higher on Moonbeam because of the heuristic that Ryan wrote.
* I checked that the init code of the `DCAHubCompanion` matches on Moonbeam and Gnosis. (They have a different constructor arg address, but I doubt that matters).

# DCAHubCompanionFactoryOne
## Moonbase Alpha
`factory.gasUsed()`: 4489665n
## Sepolia
`factory.gasUsed()`: 4489665n

# Moonbeam DCAHubCompanionFactoryOne
Kevin's failed transaction: https://moonbeam.moonscan.io/tx/0xf00006f67a9f563dcfe6bb84ec0deb0ffe1cfd0b47eb4074a20443f9d81557d8#internal
My successful transaction: https://moonscan.io/tx/0x76d520dbd3ff8f96db4f86a693af834d904caf018e1ddb6711c01e120da91711#internal
## Notes
* I used `debug_traceTransaction` to check that the two transaction hashes above attempted to deploy identical init code.
* The `debug_traceTransaction` method on Moonbeam has some seemingly incorrect gas-related fields. (Compare the second "gas" field of `trace-0xfec715.json` vs `trace-0x76d520.json`. These are supposed to be identical transactions: `dca-two.ts` with `entry2(4467448)`. The contract was deployed successfully in both scenarios.)

Observations:
* `gasleft()` returns the exact same value as the EVM, which means it doesn't include the extra storage gas costs. Evidence:
  * `gas-cost.ts`: Simple.
  * `try-storage-cost.ts`: Wrapped in a try...catch.
* Say you specify an on-chain `gas` value to call a function (e.g. `this.myFunction{ gas: ... }()`).
  * If the call _isn't_ wrapped in an on-chain try...catch, you can use the same `gas` value as an EVM chain. Evidence: `storage-cost.ts`
  * If the call _is_ wrapped in an on-chain try...catch, you _cannot_ use the same `gas` value as an EVM chain. Evidence: `try-storage-cost.ts`.
* We don't need to worry about the block storage limit. It's impossible to exceed the block storage limit without also exceeding the block gas limit. This is because adding ~40kb of storage costs 15M gas. (See their storage growth formula for context). This could change if they increase the block gas limit without increasing the block storage limit though.
