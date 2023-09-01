# Sphinx (formerly ChugSplash)

Sphinx is an open-core DevOps platform for smart contract deployments.

## Key Features

Here is the deployment process with the DevOps platform:

1. Define your project in a single declarative config file instead of writing deployment scripts. Sphinx has a Hardhat and Foundry plugin.
2. Propose your deployment gaslessly from a CI process or the command line.
3. Maintain a balance of USDC on a single chain to fund deployments. You don't need native gas tokens on any chain.
4. Approve your deployment with a single meta transaction signed by your project owners. You'll always sign a single meta transaction regardless of the number of chains or the size of the deployment.
5. Sphinx trustlessly executes your deployment on every chain and verifies your contracts on Etherscan. Your contracts will have consistent addresses across networks because Sphinx uses `CREATE3` by default.
6. Generate deployment artifacts in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

You can request access for the DevOps platform [here](https://sphinx.dev). We are working out pricing with teams on a case-by-case basis.

### Standalone CLI tool

You can also use Sphinx's Hardhat or Foundry plugin as a feature-limited deployment tool. With this CLI tool, you can define your deployments in a declarative config file and generate deployment artifacts in the same format as `hardhat-deploy`. Your contracts will be deployed using `CREATE3`. However, you won't be able to use any of the other features described above.

The standalone CLI tool is free to use and fully open-source. All of the code is in this repository. You can use it without using the DevOps platform.

## Documentation

### Getting Started

- Foundry:
  - [Quickstart](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quickstart.md)
  - [Integrate Sphinx into an Existing Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-existing-project.md)
- Hardhat:
  - [Getting Started (TypeScript)](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-hardhat-ts-getting-started.md)
  - [Getting Started (JavaScript)](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-hardhat-js-getting-started.md)

### DevOps Platform

- Foundry:
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md)
  - [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-foundry-proposals.md)
- Hardhat:
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-hardhat-getting-started.md)
  - [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-hardhat-proposals.md)

### References

- [Sphinx Config File](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md): Where you define smart contract deployments for a project.
- [Constructor Arguments](https://github.com/sphinx-labs/sphinx/blob/develop/docs/constructor-args.md): Shows how every constructor argument type can be defined in a Sphinx config file.
- [The `SphinxManager` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md): The contract that deploys your project.
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

MIT © 2022
