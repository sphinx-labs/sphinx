# Sphinx (formerly ChugSplash)
Sphinx is a [Foundry](https://github.com/foundry-rs/foundry) plugin for easily writing Solidity deployment scripts that are transparent, predictable, and multi-chain. Sphinx scripts can also be executed using the Sphinx DevOps platform which is a CI platform designed to help teams deploy smart contracts at scale.

## Key features of the Sphinx Plugin

### Deployment Preview
Sphinx has a “planning” step where it generates a deployment plan. Sphinx then provides you with a detailed preview of every action Sphinx will take during the deployment. This helps you avoid any surprises when Sphinx deploys and interacts with your contracts.

### Idempotent & Deterministic
Sphinx deploys your contracts to predictable addresses using create3. It intelligently detects which parts of your script have already been executed on a given network and automatically skips them, simplifying the process of extending your scripts.

### Multi-chain
Sphinx provides an intuitive interface for customizing your scripts to suit different networks, and makes it easy to replicate those network-specific configurations locally.

## key features of the Sphinx DevOps Platform

### Automated Deployments
With Sphinx, you can effortlessly trigger gasless deployments from your local machine or CI process. Approve deployments via the UI with a single meta transaction, and let the Sphinx Platform execute your deployment automatically on your behalf.

### Payments in USDC
Simplify the payment process by settling deployment costs on all networks in USDC on a single chain. Enjoy free deployments on testnets.

### Multichain Deployments
Sphinx empowers you to deploy and verify your contracts on up to 11 supported networks simultaneously, streamlining your deployment workflow.

You can request access to the DevOps platform [here](https://sphinx.dev).

## Documentation

### Getting Started

  - [Quickstart](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md)
  - [Integrate Sphinx into an Existing Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md)
- DevOps Platform:
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-getting-started.md)
  - [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md)

### References

- [Writing Sphinx Deployment Scripts](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md)
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

