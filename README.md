# Sphinx (formerly ChugSplash)

Sphinx is a Foundry plugin for deployments.

TODO(md): it takes 9.5s to compile the sample project every time a change is made to a file. it
takes less than 2s when the optimizer is off. we should definitely tell users to turn optimizer off
during testing and development. i think there's a section in the foundry docs that covers this.

TODO(init): `contracts/` -> `src/`

Key features:
* Skips any transactions in your script that have already been executed, similar to other idempotent tools like [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).
* Provides visibility into your deployments by letting you [preview](TODO(md)) the transactions that will be executed in your script.
* Uses `CREATE3` by default, so your contracts will always have predictable addresses.
* Generates deployments artifacts in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

## DevOps Platform (optional)

Sphinx has a DevOps platform that automates the deployment process. It's built on top of the Foundry plugin, and is entirely opt-in.

Key features:
* Propose your deployments from a CI process.
* Maintain a balance of USDC on a single chain to fund deployments. You don't need native gas tokens on any chain.
* Approve your deployments via a multisig.
* Automatic Etherscan verification.

You can request access to the DevOps platform [here](https://sphinx.dev).

## Documentation

### Getting Started

- Foundry Plugin:
  - [Quickstart](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quickstart.md)
  - [Integrate Sphinx into an Existing Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-existing-project.md)
- DevOps Platform:
  - [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md)
  - [Using Sphinx in CI](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-foundry-proposals.md)

### References

- [Sphinx Config File](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md): Where you define smart contract deployments for a project.
- [Post-Deployment Actions](https://github.com/sphinx-labs/sphinx/blob/develop/docs/post-deployment-actions.md): How to call arbitrary functions after your contracts are deployed.
- [Constructor Argument Overrides](https://github.com/sphinx-labs/sphinx/blob/develop/docs/constructor-arg-overrides.md): How to set constructor arguments on a chain-by-chain basis.
- [Contract Variables](https://github.com/sphinx-labs/sphinx/blob/develop/docs/variables.md): Shows how to define every type of contract variable in your Sphinx config file (structs, arrays, etc.).
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


TODO(md-end): remove 'foundry' from the .md file names
