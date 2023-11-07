# Sphinx: DevOps for Deployments

Sphinx automates the smart contract deployment process by funding, executing, and verifying deployments on your behalf.

> Sphinx is not audited yet, so you should **always** check that your deployments were executed correctly.

## Key features:

* **Gasless deployments**: You don't need to worry about securing a funded private key or getting native gas tokens on any chain. Instead, simply maintain a balance of USDC on a single chain to fund deployments across all chains.

* **One-Click Multichain Deployments**: Your project owners can approve deployments across up to 11 supported networks by signing a single meta transaction. Sphinx will execute the deployment on each chain in parallel.

* **Deployments in CI**: Initiating deployments from a CI process has obvious benefits such as reproducibility and consistency, but it hasn't been practical until now. With Sphinx, you can propose deployments from your CI process, then approve it in our UI (all gaslessly, of course). Sphinx's backend will execute the deployment on your behalf. If you'd rather not use a CI process, you can propose deployments from your local machine instead.

* **Automatic Etherscan verification**

* **Compatible with Forge Scripts**: You can integrate Sphinx with minimal changes to your existing Forge scripts.

## Request access

Sphinx is currently invite-only. [Request access on our website.](https://sphinx.dev)

## Documentation

### Getting started

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)
- [The Sphinx DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/main/docs/ops-getting-started.md)

### Reference guides

- [Writing Deployment Scripts](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md)
- [Configuration Options](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md)
- [Overview of the Sphinx DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/main/docs/ops-overview.md)
- [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/main/docs/ci-proposals.md)
- [FAQ](https://github.com/sphinx-labs/sphinx/blob/main/docs/faq.md)
- [Troubleshooting Guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/troubleshooting-guide.md)

## Current limitations

- Sphinx supports `CREATE2` and `CREATE3`, but not the `CREATE` opcode, i.e. `new MyContract(...)`.
- You cannot send ETH as part of a deployment.

Please feel free to reach out in our [Discord](https://discord.gg/7Gc3DK33Np) to request a feature!

## Supported Networks

- Ethereum
- Optimism
- Arbitrum
- Polygon
- Polygon zkEVM
- BNB Smart Chain (aka BSC)
- Gnosis Chain
- Avalanche C-Chain
- Linea
- Fantom
- Base

Test networks:

- Ethereum Goerli
- Optimism Goerli
- Arbitrum Goerli
- Polygon Mumbai
- Polygon zkEVM Testnet
- BNB Smart Chain Testnet
- Gnosis Chiado
- Avalanche Fuji
- Linea Goerli
- Fantom Testnet
- Base Goerli

More networks are on the way! Please feel free to reach out in our [Discord](https://discord.gg/7Gc3DK33Np) if there are networks you'd like us to add.

## Contributors

[@smartcontracts](https://github.com/smartcontracts)\
[Wonderland](https://defi.sucks/)\
[@rpate97](https://github.com/RPate97)\
[@sam-goldman](https://github.com/sam-goldman)

## Contributing

Contributions to Sphinx are greatly appreciated! To get started, please read our [contributing guide](https://github.com/sphinx-labs/sphinx/blob/main/CONTRIBUTING.md). Then, check out the list of [Good First Issues](https://github.com/sphinx-labs/sphinx/contribute). Let us know if you have any questions!

## Reach Out

If you have any questions or feature requests, send us a message in our [Discord!](https://discord.gg/7Gc3DK33Np)

## License

MIT © 2023

