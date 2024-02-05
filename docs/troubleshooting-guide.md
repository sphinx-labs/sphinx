# Troubleshooting

This guide covers some common issues you might encounter using Sphinx. If your question isn't answered here, please reach out in our [Discord](https://discord.gg/7Gc3DK33Np).

## Table of Contents

- [Slow compilation speed](#slow-compilation-speed)
- [Errors](#errors)
  - [Installing Sphinx's Foundry fork](#installing-sphinxs-foundry-fork)
  - [`Ineffective mark-compacts near heap limit allocation failed`](#ineffective-mark-compacts-near-heap-limit-allocation-failed)
  - [`EvmError: MemoryLimitOOG`](#evmerror-memorylimitoog)

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

### Installing Sphinx's Foundry fork

If you're getting an error when installing Sphinx's Foundry fork, we recommend removing your existing Foundry installation and then re-installing Foundry.

Here are the steps to do this:

> Note: The following instructions will be slightly different if you're not using MacOS or Linux.

1. Remove your existing Foundry installation:
```
rm -rf ~/.foundry/
```

2. Install Foundry using your preferred method. See [Foundry's installation guide](https://book.getfoundry.sh/getting-started/installation) for instructions.

4. Install Sphinx's fork of Foundry:
```
foundryup --repo sphinx-labs/foundry --branch sphinx-patch-v0.1.0
```

If the problem persists, please reach out to us in our [Discord](https://discord.gg/7Gc3DK33Np).

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
