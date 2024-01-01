# Troubleshooting

This guide covers some common issues you might encounter using Sphinx. If your question isn't answered here, please reach out in our [Discord](https://discord.gg/7Gc3DK33Np).

## Table of Contents

- [Labeling contracts](#labeling-contracts)
- [Slow compilation speed](#slow-compilation-speed)
- [Errors](#errors)
  - [`Ineffective mark-compacts near heap limit allocation failed`](#ineffective-mark-compacts-near-heap-limit-allocation-failed)
  - [`EvmError: MemoryLimitOOG`](#evmerror-memorylimitoog)

## Labeling contracts

When Sphinx can't infer the contract corresponding to an address, you'll be asked to label it yourself. This makes it possible for Sphinx to verify the contract on Etherscan and create a deployment artifact for it.

You can label a contract in your deployment script with the `sphinxLabel` function, which is inherited from `Sphinx.sol`. For example:

```sol
MyToken token = new MyToken{ salt: bytes32(0) }();
sphinxLabel(address(token), "src/tokens/MyToken.sol:MyToken");
```

You must use the **fully qualified name** of the contract, which is in the format `full/path/to/SourceFile.sol:ContractName`, as shown in the example above.

If you're having trouble finding the contract corresponding to an address, we recommend using `console.log`. You can import it into your script using:

```
import "forge-std/console.sol";
```

Then, you can log the addresses of your contracts:

```
MyToken token = new MyToken{ salt: bytes32(0) }();
console.log('MyToken', address(token));
```

## Slow compilation speed

Sphinx may slow down the compilation speed of your script because the `Sphinx.sol` contract is large. You can speed up compilation during development by disabling the Solidity compiler optimizer. One approach is to create a new profile in your `foundry.toml` file. For example:

```
[profile.lite]
optimizer = false
```

Then, you can prefix any `forge` command with `FOUNDRY_PROFILE=lite` to reduce compilation time. For example:

```
FOUNDRY_PROFILE=lite forge build
```

If you don't include this prefix in a `forge` command, Foundry will continue using the default profile in your `foundry.toml`, which is called `profile.default`.

## Errors

### `Ineffective mark-compacts near heap limit allocation failed`
This bug can occur in repositories that have a very large number of contracts in them. This causes your build info artifact files to be extremely large, which can cause memory issues when using Sphinx. You can resolve this issue by running `forge clean`, which clears the artifacts directory, including the build info files.

### `EvmError: MemoryLimitOOG`

This error occurs when Foundry runs out of memory during a Forge script, which can happen for larger deployments.

You can resolve this by increasing the EVM memory limit in Foundry. We recommend setting it to `3355443200`, which is roughly 3.4 gigabytes. There are a couple of ways to configure it:

#### 1. In your `foundry.toml`:

```toml
memory_limit=3355443200
```

#### 2. Environment variables:

```env
FOUNDRY_MEMORY_LIMIT=3355443200
```

or:

```env
DAPP_MEMORY_LIMIT=3355443200
```
