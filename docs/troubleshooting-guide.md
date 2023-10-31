# Troubleshooting Guide

This guide covers some common issues you might encounter using Sphinx. If your question isn't answered here, please reach out in the [Discord](https://discord.gg/7Gc3DK33Np).

## Table of Contents

- [Labeling contracts](#labeling-contracts)
- [`Ineffective mark-compacts near heap limit allocation failed` error](#ineffective-mark-compacts-near-heap-limit-allocation-failed-error)

### Labeling contracts

When Sphinx can't infer the contract that corresponds to an address, you'll be asked to label it yourself. This allows Sphinx to write the contract's deployment artifact and verify it on Etherscan.

You can label a contract in your deployment script with the `sphinxLabel` function, which is inherited from `Sphinx.sol`. For example:

```sol
MyToken token = new MyToken{ salt: bytes32(0) }();
sphinxLabel(address(token), "src/tokens/MyToken.sol:MyToken");
```

You must use the **fully qualified name** of the contract, which is in the format `full/path/to/SourceFile.sol:ContractName`, as shown in the example above.

If you're having trouble finding the contract that corresponds to an address, we recommend using `console.log`. You can import it into your script using `import "forge-std/console.sol";`.

### `Ineffective mark-compacts near heap limit allocation failed` error
This bug can occur in repositories that have a very large number of contracts in them. This causes your build info artifact files to be extremely large, which can cause memory issues when using Sphinx. You can resolve this issue by running `forge clean`, which clears the artifacts directory, including the build info files.
