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

Reasons:
* `gasleft()` returns the exact same value as the EVM, which means it doesn't include the extra storage gas costs. (Confirmed: `gas-used.ts`)
* You can hard-code the same `gas` value on-chain to call a function (e.g. `this.myFunction{ gas: ... }()`). (Confirmed: `storage-cost.ts`)
* Hypothesis: The `execTransactionFromModule` call can fail randomly depending on whether it causes the block storage limit to exceed 40,960 bytes (or 40,000 bytes, depending on which documentation you're reading).
