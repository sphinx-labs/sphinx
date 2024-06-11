# Sphinx: DevOps for Deployments

Sphinx is an automated smart contract deployment platform for Foundry. Key features include gasless deployments, one-click multi-chain deployments, and deployments in CI. You can integrate Sphinx with minimal changes to your existing Forge scripts.

Deployments with Sphinx are a three-step process:
1. **Propose**: Initiate the deployment from your command line or CI process by submitting the transactions to Sphinx's backend.
2. **Approve**: Your Gnosis Safe owner(s) approve the deployment by signing a single meta transaction in the Sphinx UI.
3. **Execute**: Sphinx's backend trustlessly executes the deployment through your Gnosis Safe.

## Key features:

* **Gasless Deployments**: You don't need to worry about securing a funded private key or getting native gas tokens on any chain. We'll bill you in fiat after your deployment is finished. Deployments on testnets are completely free.

* **One-Click Multichain Deployments**: Approve deployments across dozens of networks by signing a single meta transaction. Sphinx's backend will deploy on each network in parallel and verify your smart contracts on block explorers.

* **Deployments in CI**: Eliminate human error and improve security by gaslessly triggering deployments from your CI process. You can always propose from your local machine if you'd prefer.

* **Deploy via Gnosis Safe**: The Sphinx protocol is a [Gnosis Safe Module](https://docs.safe.global/safe-smart-account/modules) designed for deployments. With the Sphinx Module, your Gnosis Safe owners can approve multi-chain deployments by signing a single meta transaction. Sphinx will deploy a Gnosis Safe on your behalf at a consistent address using `CREATE2`.

* **Trustless**: It's impossible to execute anything your Gnosis Safe owners have not explicitly approved. Spearbit has audited our system; see our audit report [here](https://github.com/sphinx-labs/sphinx/blob/main/audit/spearbit.pdf).

* **Compatible with Forge Scripts**: You can integrate Sphinx by adding a few lines of code to your existing Forge scripts.

* **Deployment Artifact Management**: Sphinx generates and stores deployment artifacts, which can be retrieved at any time.

* **Contract Verification**: Sphinx automatically verifies contracts on block explorers with no configuration necessary.

* **No Lock-In**: You can execute deployments from your local machine without using the Sphinx DevOps Platform. These deployments are executed in the exact same manner as they would be executed with the DevOps Platform, including identical contract addresses. This includes networks that the DevOps Platform doesn't currently support.

## Self Hosting
Sphinx is designed to be used with the [Sphinx Platform](https://github.com/sphinx-labs/sphinx-platform) which you must host yourself. You can find information on running the Sphinx Platform locally and recommendations for hosting in the [Sphinx Platform documentation](https://github.com/sphinx-labs/sphinx-platform/blob/main/docs).

## Pricing

Sphinx is free and open source. You must host the Sphinx platform yourself to be able to use it.

## Demo

A demo of the DevOps Platform is on the [website's landing page](https://sphinx.dev).

## Documentation

### Getting Started

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started with an Existing Foundry Project](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)

### References

- [Writing Deployment Scripts](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md)
- [CLI Propose Command](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-propose.md)
- [Propose in CI](https://github.com/sphinx-labs/sphinx/blob/main/docs/ci-proposals.md)
- [Configuration Options](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md)
- [Deploy from the CLI](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-deploy.md)
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

- You cannot deploy [libraries](https://docs.soliditylang.org/en/v0.8.24/contracts.html#libraries).
- You can only use the [Deploy CLI Command](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-deploy.md) on live networks if your Gnosis Safe has a single owner. (Deployments with the DevOps Platform support an arbitrary number of owners).

## Coming Soon

- Use existing Gnosis Safes with Sphinx.
- Pay for deployments with USDC on the DevOps Platform.

Please feel free to reach out to us in our [Discord](https://discord.gg/7Gc3DK33Np) to request a feature!

## Networks Supported
The Sphinx core contracts are deployed on the following networks.

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
- Scroll
- Zora
- RARI
- Celo
- Moonbeam
- Moonriver
- Fuse
- Evmos
- Kava
- Rootstock
- Blast
- Mode
- Mantle
- Darwinia
- Crab
- Astar zkEVM

Test networks:

- Ethereum Sepolia
- Optimism Sepolia
- Arbitrum Sepolia
- Polygon Amoy
- Polygon zkEVM Cardona
- BNB Smart Chain Testnet
- Gnosis Chiado
- Avalanche Fuji
- Linea Sepolia
- Fantom Testnet
- Base Sepolia
- Scroll Sepolia
- Zora Sepolia
- Rari Sepolia
- Celo Alfajores
- Moonbase Alpha
- Evmos Testnet
- Kava Testnet
- Rootstock Testnet
- Blast Sepolia
- Darwinia Pangolin
- Taiko Katla
- Mantle Sepolia
- Astar zKyoto

## Contributors

[@rpate97](https://github.com/RPate97)\
[@sam-goldman](https://github.com/sam-goldman)\
[@smartcontracts](https://github.com/smartcontracts)\
[Wonderland](https://defi.sucks/)

## License

We use the Gnosis Safe contracts as a library. These contracts are licensed under [LGPL v3](https://github.com/safe-global/safe-contracts/blob/main/LICENSE). You can access them in [Gnosis Safe's repository](https://github.com/safe-global/safe-contracts).

All other code in this repository is licensed under [MIT](https://github.com/sphinx-labs/sphinx/blob/develop/LICENSE).
