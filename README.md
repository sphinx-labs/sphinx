# Sphinx (formerly ChugSplash)

A declarative and deterministic framework for deploying smart contracts. Available for both Hardhat and Foundry.

Powers the [Sphinx Managed Service](https://www.sphinx.dev).

> **WARNING**: The code and contracts Sphinx uses to deploy and upgrade your contracts HAVE NOT been audited. Sphinx is a BETA product undergoing significant active development. Sphinx's behavior and APIs are subject to change at any time at our discretion. You should not use Sphinx if you would be very upset with your project breaking without notice. We make no guarantees about the safety of any contract deployments using the Sphinx system.

If you want to use Sphinx in production, ask a question, or request a feature then we'd love to hear from you in the [Discord!](https://discord.gg/7Gc3DK33Np)

## Features

### Sphinx Core Protocol
The Core Protocol includes smart contracts as well as Hardhat and Foundry plugins. All of the code is MIT licensed and is located inside this repository.
- Define deployments [declaratively](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-file.md#layout-of-a-sphinx-file) in a single file, inspired by [Terraform](https://www.terraform.io/).
- Deployments are fully atomic, deterministic, and idempotent. Deployments cannot be halted for any reason and are finalized in a single transaction.
- Deploys contracts at consistent addresses across networks using `CREATE2`
- Keep track of contract dependencies using simple template syntax (i.e. `{{ MyContract }}`).
- Generates deployment artifacts in the same format as hardhat-deploy

### [Sphinx Managed Service](https://www.sphinx.dev)
The Sphinx Managed Service is an optional product built on top of the Sphinx Core Protocol designed to provide more advanced DevOps functionality for smart contract development teams.
- Manage projects, contracts, and deployments in a UI
- Gaslessly propose deployments from your CI process
- Approve deployments with a single transaction through the UI
- Deployments are trustlessly executed by our hosted backend
- Automatic Etherscan verification

## Getting Started

### Foundry
[Get started with Sphinx for Foundry](https://github.com/sphinx-labs/sphinx/blob/develop/docs/foundry/getting-started.md)

### Hardhat
[Get started with Sphinx for Hardhat](https://github.com/sphinx-labs/sphinx/blob/develop/docs/hardhat/getting-started.md)

## Documentation

- [Sphinx File](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-file.md): Detailed explanation of the file where you define your deployments and upgrades.
- [Variables Reference](https://github.com/sphinx-labs/sphinx/blob/develop/docs/variables.md): Reference describing how to assign values to every variable type in a Sphinx config file.
- [Using Sphinx on Live Networks](https://github.com/sphinx-labs/sphinx/blob/develop/docs/live-network.md): Instructions for using Sphinx to deploy or upgrade a project on a live network.
- Integrating with CI for [Hardhat](https://github.com/sphinx-labs/sphinx/blob/develop/docs/hardhat/ci-integration.md) and [Foundry](https://github.com/sphinx-labs/sphinx/blob/develop/docs/hardhat/ci-integration.md): Walkthrough of how to setup Sphinx deployments in your CI process using GitHub actions.
- [Special Variable Definitions](https://github.com/sphinx-labs/sphinx/blob/develop/docs/special-var-defs.md): Explains how to define contract references in your Sphinx config file.
- [Immutable Variables](https://github.com/sphinx-labs/sphinx/blob/develop/docs/immutable-variables.md): How to define immutable variables with Sphinx.
- [How Sphinx Works](https://github.com/sphinx-labs/sphinx/blob/develop/docs/how-sphinx-works.md). A deep dive into the Sphinx Core Protocol.

## Supported Networks
* Ethereum Goerli
* Optimism Goerli

Sphinx is capable of supporting any EVM compatible network. If you'd like to use Sphinx on network that is not listed, please let us know and we'd be happy to take care of deploying the Sphinx contracts to it.

Sphinx is an experimental product and currently only supports test networks. If you would like to use Sphinx in production, we'd love to work with you. Please feel free to [join the Discord](https://discord.gg/7Gc3DK33Np) and shoot us a message!

## Maintainers

[@smartcontracts](https://github.com/smartcontracts)\
[@sam-goldman](https://github.com/sam-goldman)\
[@rpate97](https://github.com/RPate97)

## Contributing

Contributors welcome, please read through [CONTRIBUTING.md](https://github.com/sphinx-labs/sphinx/blob/develop/CONTRIBUTING.md) for an overview of the contributing process for this repository and to get your development environment up and running. Then check out the list of [Good First Issues](https://github.com/sphinx-labs/sphinx/contribute) to find something to work on! If you're not sure where to start, [join the Discord](https://discord.gg/7Gc3DK33Np) and shoot us a message!

## License

MIT © 2022
