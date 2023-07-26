# Sphinx (formerly ChugSplash)

Sphinx is a DevOps platform for smart contract deployments.

## Key Features

Sphinx can either be used as a standalone CLI tool for simple deployments, or as a DevOps platform that extends the CLI tool with additional functionality.

### Standalone CLI
- Define deployments in a declarative config file instead of writing deployment scripts
- Consistent addresses across networks via `CREATE3`
- Deployment artifacts in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy)
- Available as a Foundry and Hardhat plugin

### DevOps Platform
- Approve multi-chain deployments with a single meta transaction
- Maintain a balance of USDC on a single chain to fund deployments
- Automatic Etherscan verification
- Support for multisigs (coming soon)

## Documentation

### Getting Started:
- Foundry:
  - [Quick Start](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quick-start.md)
  - [Integrate Sphinx into an Existing Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-existing-project.md)
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md)
- Hardhat:
  - [Getting Started (TypeScript)](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-hardhat-ts-getting-started.md)
  - [Getting Started (JavaScript)](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-hardhat-js-getting-started.md)
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-hardhat-getting-started.md)

### References:
- [Sphinx Config File](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md): Where you define smart contract deployments for a project.
- [Constructor Arguments](https://github.com/sphinx-labs/sphinx/blob/develop/docs/constructor-args.md): Shows how every constructor argument type can be defined in a Sphinx config file.
- [The `SphinxManager` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md): The contract that deploys your project.

## Supported Networks

* Ethereum
* Optimism
* Arbitrum
* Polygon
* BNB Smart Chain (aka BSC)
* Gnosis Chain

Test networks:
* Ethereum Goerli
* Optimism Goerli
* Arbitrum Goerli
* Polygon Mumbai
* BNB Smart Chain Testnet
* Gnosis Chiado

## Reach Out

If you have any questions, feature requests, or want us to add a new network, send us a message in our [Discord!](https://discord.gg/7Gc3DK33Np)

## Maintainers

[@smartcontracts](https://github.com/smartcontracts)\
[@sam-goldman](https://github.com/sam-goldman)\
[@rpate97](https://github.com/RPate97)

## Contributing

Contributions to Sphinx are greatly appreciated! To get started, please read our [contributing guide](https://github.com/sphinx/sphinx/blob/develop/CONTRIBUTING.md). Then, check out the list of [Good First Issues](https://github.com/sphinx/sphinx/contribute). If you're not sure where to start, [join the Discord](https://discord.gg/7Gc3DK33Np) and send us a message!

## License

MIT © 2022
