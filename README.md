# Sphinx: DevOps for Deployments

Sphinx automates the smart contract deployment process by funding, executing, and verifying deployments on your behalf.

## Key features:

* **Compatible with Forge Scripts**: You can integrate Sphinx with minimal changes to your existing Forge scripts.

* **Gasless deployments**: You don't need to worry about securing a funded private key or getting native gas tokens on any chain. Instead, simply maintain a balance of USDC on a single chain to fund deployments across all chains.

* **Deployments in CI**: Initiating deployments from a CI process has obvious benefits such as reproducibility and consistency, but it hasn't been practical until now. With Sphinx, you can propose deployments from your CI process, then approve it in our UI (all gaslessly, of course). Sphinx's backend will execute the deployment on your behalf. If you'd prefer not to use a CI process, you can propose deployments from your local machine instead.

* **Automatic Etherscan verification**.

> Important: Sphinx is not audited yet, so you should **always** check that your deployments were executed correctly.

[Request access to the DevOps platform.](https://sphinx.dev)

## Documentation

TODO(md-end): check that we include all of the docs. we're missing permissioned functions at least

### Getting started

If you're setting up a project in a fresh repository, begin with the [Quickstart](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md) guide. Otherwise, begin with the [Integrating Sphinx into an Existing Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md) guide.

After you've finished one of these guides, your next step is to follow the [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-getting-started.md) guide.

### References

- [Configuring Sphinx Deployments](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md)
- [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md): A proposing deployments
- [FAQ](https://github.com/sphinx-labs/sphinx/blob/develop/docs/faq.md)
- [Troubleshooting Guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/troubleshooting-guide.md)

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

