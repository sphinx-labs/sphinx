# Sphinx: DevOps for Deployments

Sphinx is an automated smart contract deployment platform for Foundry. Key features include gasless deployments, one-click multi-chain deployments, and deployments in CI. You can integrate Sphinx with minimal changes to your existing Forge scripts.

Deployments with Sphinx are a three-step process:
1. **Propose**: Initiate the deployment from your command line or CI process by submitting the transactions to Sphinx's backend.
2. **Approve**: Your Gnosis Safe owner(s) approve the deployment by signing a single meta transaction in the Sphinx UI.
3. **Execute**: Sphinx's backend trustlessly executes the deployment through your Gnosis Safe.

## Key features:

* **Gasless Deployments**: You don't need to worry about securing a funded private key or getting native gas tokens on any chain. We'll bill you in fiat after your deployment is finished. Deployments on testnets are completely free.

* **One-Click Multichain Deployments**: Approve deployments across 11 supported networks by signing a single meta transaction. Sphinx's backend will deploy on each network in parallel and verify your smart contracts on Etherscan.

* **Deployments in CI**: Eliminate human error and improve security by gaslessly triggering deployments from your CI process. You can always propose from your local machine if you'd prefer.

* **Deploy via Gnosis Safe**: The Sphinx protocol is a [Gnosis Safe Module](https://docs.safe.global/safe-smart-account/modules) designed for deployments. With the Sphinx Module, your Gnosis Safe owners can approve multi-chain deployments by signing a single meta transaction. Sphinx will deploy a Gnosis Safe on your behalf at a consistent address using `CREATE2`.

* **Trustless**: It's impossible to execute anything your Gnosis Safe owners have not explicitly approved. Spearbit has audited our system; see our audit report [here](https://github.com/sphinx-labs/sphinx/blob/main/audit/spearbit.pdf).

* **Compatible with Forge Scripts**: You can integrate Sphinx by adding a few lines of code to your existing Forge scripts.

## Request Access

Sphinx is currently invite-only. [Request access on our website.](https://sphinx.dev)

## Documentation

### Getting Started

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started with an Existing Foundry Project](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)

### References

TODO:
- [Writing Deployment Scripts](./docs/writing-scripts.md)
- [CLI Propose Command](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-propose.md)
- [Propose in CI](https://github.com/sphinx-labs/sphinx/blob/main/docs/ci-proposals.md)
- [Configuration Options](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md)
- [Deploy from the CLI](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-deployments.md)
- [Deployment Artifacts](https://github.com/sphinx-labs/sphinx/blob/main/docs/docs/deployment-artifacts.md)
- [Troubleshooting](https://github.com/sphinx-labs/sphinx/blob/main/docs/troubleshooting-guide.md)
- [FAQ](https://github.com/sphinx-labs/sphinx/blob/main/docs/faq.md)
- [Architecture Overview](https://github.com/sphinx-labs/sphinx/blob/main/docs/architecture-overview.md)

### Specifications

- [Introduction](https://github.com/sphinx-labs/sphinx/blob/develop/specs/introduction.md)
- [Sphinx Merkle Tree](https://github.com/sphinx-labs/sphinx/blob/develop/specs/merkle-tree.md)
- [`SphinxModuleProxy` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy.md)
- [`SphinxModuleProxyFactory` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy-factory.md)
- [`ManagedService` Contract](https://github.com/sphinx-labs/sphinx/blob/develop/specs/managed-service.md)

### Security

- [Spearbit Audit](https://github.com/sphinx-labs/sphinx/blob/main/audit/spearbit.pdf)

## Current Limitations

- Sphinx supports `CREATE2` and `CREATE3` but not the `CREATE` opcode, i.e. `new MyContract(...)`.
- You cannot send ETH as part of a deployment.

## Coming Soon

- Use existing Gnosis Safes with Sphinx.
- Pay for deployments with USDC on the DevOps Platform.
- Deploy from the CLI on networks that the DevOps Platform doesn't support.

Please feel free to reach out to us in our [Discord](https://discord.gg/7Gc3DK33Np) to request a feature!

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

- Ethereum Sepolia
- Optimism Sepolia
- Arbitrum Sepolia
- Polygon Mumbai
- Polygon zkEVM Goerli
- BNB Smart Chain Testnet
- Gnosis Chiado
- Avalanche Fuji
- Linea Goerli
- Fantom Testnet
- Base Sepolia

More networks are on the way! Please reach out to us in our [Discord](https://discord.gg/7Gc3DK33Np) if there are networks you'd like us to add.

## Contributors

[@rpate97](https://github.com/RPate97)\
[@sam-goldman](https://github.com/sam-goldman)\
[@smartcontracts](https://github.com/smartcontracts)\
[Wonderland](https://defi.sucks/)

## Contributing

Contributions to Sphinx are greatly appreciated! Please read our [contributing guide](https://github.com/sphinx-labs/sphinx/blob/main/CONTRIBUTING.md) to get started. Then, check out the list of [Good First Issues](https://github.com/sphinx-labs/sphinx/contribute). Let us know if you have any questions!

## Reach Out

If you have any questions or feature requests, send us a message in our [Discord!](https://discord.gg/7Gc3DK33Np)

## License

We use the Gnosis Safe contracts as a library. These contracts are licensed under [LGPL v3](https://github.com/safe-global/safe-contracts/blob/main/LICENSE). You can access them in [Gnosis Safe's repository](https://github.com/safe-global/safe-contracts).

All other code in this repository is licensed under [MIT](https://github.com/sphinx-labs/sphinx/blob/develop/LICENSE).
