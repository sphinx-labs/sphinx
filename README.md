# Sphinx (formerly ChugSplash)
Sphinx is a Foundry plugin for writing transparent, predictable, and multi-chain deployment scripts. Sphinx has an opt-in DevOps platform that automates the deployment process with features such as gasless deployments in CI and multichain deployments.

Key features:
* **Deployment preview**: Sphinx provides visibility into your deployments by generating a [preview](TODO(md): screenshot) before any transactions are executed.
* **Create3**: Sphinx deploys your contracts to predictable addresses using `CREATE3`.
* **Multi-chain**: Sphinx makes it easy to write chain-specific logic and replicate these configurations locally.

## Sphinx DevOps Platform
The Sphinx DevOps Platform is built on top of the Foundry plugin, and is entirely opt-in.

Key features:
* Propose your deployments gaslessly from a CI process or your local machine, approve deployments via the Sphinx UI with a single meta transaction, and have your deployment executed by the Sphinx Platform across up to 11 different networks.
* Maintain a balance of USDC on a single chain to fund deployments across all chains. You don't need native gas tokens on any chain.
* Automatic Etherscan verification.

[Request access to the DevOps platform.](https://sphinx.dev)

> Sphinx is in active development and uses smart contracts which are not yet audited. You should **always** verify your contracts were deployed and configured properly after deploying with Sphinx.

## Documentation

### Getting Started

- Foundry Plugin:
  - [Quickstart](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md)
  - [Integrate Sphinx into an Existing Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md)
- DevOps Platform:
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-getting-started.md)
  - [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md)

### References

- [Writing Deployment Scripts with Sphinx](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md)
- [Troubleshooting Guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/troubleshooting-guide.md)
- [The `SphinxManager` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md)
- [FAQ](https://github.com/sphinx-labs/sphinx/blob/develop/docs/faq.md)

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

Contributions to Sphinx are greatly appreciated! To get started, please read our [contributing guide](https://github.com/sphinx-labs/sphinx/blob/develop/CONTRIBUTING.md). Then, check out the list of [Good First Issues](https://github.com/sphinx-labs/sphinx/contribute). Let us know if you have any questions!

## Reach Out

If you have any questions or feature requests, send us a message in our [Discord!](https://discord.gg/7Gc3DK33Np)

## License

MIT © 2023

