# Sphinx: DevOps for Deployments

Sphinx is a protocol and Foundry plugin that automates the smart contract deployment process.

## Key features:

* **Gasless deployments**: You don't need to worry about securing a funded private key or getting native gas tokens on any chain. We'll handle the fees and bill you in fiat or USDC after your deployment is completed.

* **One-Click Multichain Deployments**: Approve deployments across 11 supported networks by signing a single meta transaction. Sphinx's backend will trustlessly execute the deployment on each network in parallel and then verify your smart contracts on Etherscan.

* **Deployments in CI**: Initiating deployments from a CI process has obvious benefits, such as reproducibility and consistency, but it hasn't been practical until now. With Sphinx, you can propose deployments from your CI process and then approve them in our UI (all gaslessly, of course). If you'd rather not use a CI process, you can propose deployments from your local machine.

- **Powered by Gnosis Safe**: The Sphinx protocol is a [Gnosis Safe Module](https://docs.safe.global/safe-smart-account/modules) designed for deployments. With the Sphinx Module, your Gnosis Safe owners can approve deployments across an arbitrary number of chains by signing a single meta transaction.

- **Secure `CREATE3` Deployments**: You can use your multisig as your permissioned `CREATE3` deployer instead of relying on a single private key to get consistent contract addresses across networks.

* **Compatible with Forge Scripts**: You can integrate Sphinx with minimal changes to your existing Forge scripts.

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

### Specifications

- [Introduction](https://github.com/sphinx-labs/sphinx/blob/feature/audit/specs/introduction.md)
- [`SphinxModuleProxy` Contract](https://github.com/sphinx-labs/sphinx/blob/feature/audit/specs/sphinx-module-proxy.md)
- [`SphinxModuleProxyFactory` Contract](https://github.com/sphinx-labs/sphinx/blob/feature/audit/specs/sphinx-module-proxy-factory.md)
- [`ManagedService` Contract](https://github.com/sphinx-labs/sphinx/blob/feature/audit/specs/managed-service.md)
- [Sphinx Merkle Tree](https://github.com/sphinx-labs/sphinx/blob/feature/audit/specs/merkle-tree.md)

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

Contributions to Sphinx are greatly appreciated! Please read our [contributing guide](https://github.com/sphinx-labs/sphinx/blob/main/CONTRIBUTING.md) to get started. Then, check out the list of [Good First Issues](https://github.com/sphinx-labs/sphinx/contribute). Let us know if you have any questions!

## Reach Out

If you have any questions or feature requests, send us a message in our [Discord!](https://discord.gg/7Gc3DK33Np)

## License
We use the Gnosis Safe contracts as a library, licensed under [LGPL v3](https://github.com/safe-global/safe-contracts/blob/main/LICENSE). You can access the Gnosis Safe contracts in their [public repo](https://github.com/safe-global/safe-contracts).

The Sphinx Safe Module and all other code in this repository is licensed under [MIT](https://github.com/sphinx-labs/sphinx/blob/feature/audit/LICENSE).
