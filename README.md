# ChugSplash

A declarative and deterministic framework for deploying smart contracts. Available for both Hardhat and Foundry.

Powers the [ChugSplash Managed Service](https://www.chugsplash.io).

> **WARNING**: The code and contracts ChugSplash uses to deploy and upgrade your contracts HAVE NOT been audited. ChugSplash is a BETA product undergoing significant active development. ChugSplash's behavior and APIs are subject to change at any time at our discretion. You should not use ChugSplash if you would be very upset with your project breaking without notice. We make no guarantees about the safety of any contract deployments using the ChugSplash system.

If you want to use ChugSplash in production, ask a question, or request a feature then we'd love to hear from you in the [Discord!](https://discord.gg/7Gc3DK33Np)

## Features

### ChugSplash Core Protocol
The Core Protocol includes smart contracts as well as Hardhat and Foundry plugins. All of the code is MIT licensed and is located inside this repository.
- Define deployments [declaratively](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md#layout-of-a-chugsplash-file) in a single file, inspired by [Terraform](https://www.terraform.io/).
- Deployments are fully atomic, deterministic, and idempotent. Deployments cannot be halted for any reason and are finalized in a single transaction.
- Deploys contracts at consistent addresses across networks using `CREATE2`
- Keep track of contract dependencies using simple template syntax (i.e. `{{ MyContract }}`).
- Generates deployment artifacts in the same format as hardhat-deploy

### [ChugSplash Managed Service](https://www.chugsplash.io)
The ChugSplash Managed Service is an optional product built on top of the ChugSplash Core Protocol designed to provide more advanced DevOps functionality for smart contract development teams.
- Manage projects, contracts, and deployments in a UI
- Gaslessly propose deployments from your CI process
- Approve deployments with a single transaction through the UI
- Deployments are trustlessly executed by our hosted backend
- Automatic Etherscan verification

## Getting Started

### Foundry
[Get started with ChugSplash for Foundry](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/getting-started.md)

### Hardhat
[Get started with ChugSplash for Hardhat](https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/getting-started.md)

## Documentation

- [ChugSplash File](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md): Detailed explanation of the file where you define your deployments and upgrades.
- [Variables Reference](https://github.com/chugsplash/chugsplash/blob/develop/docs/variables.md): Reference describing how to assign values to every variable type in a ChugSplash config file.
- [Using ChugSplash on Live Networks](https://github.com/chugsplash/chugsplash/blob/develop/docs/live-network.md): Instructions for using ChugSplash to deploy or upgrade a project on a live network.
- Integrating with CI for [Hardhat](https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/ci-integration.md) and [Foundry](https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/ci-integration.md): Walkthrough of how to setup ChugSplash deployments in your CI process using GitHub actions.
- [Special Variable Definitions](https://github.com/chugsplash/chugsplash/blob/develop/docs/special-var-defs.md): Explains how to define contract references in your ChugSplash config file.
- [Immutable Variables](https://github.com/chugsplash/chugsplash/blob/develop/docs/immutable-variables.md): How to define immutable variables with ChugSplash.
- [How ChugSplash Works](https://github.com/chugsplash/chugsplash/blob/develop/docs/how-chugsplash-works.md). A deep dive into the ChugSplash Core Protocol.

## Supported Networks
* Ethereum Goerli
* Optimism Goerli

ChugSplash is capable of supporting any EVM compatible network. If you'd like to use ChugSplash on network that is not listed, please let us know and we'd be happy to take care of deploying the ChugSplash contracts to it.

ChugSplash is an experimental product and currently only supports test networks. If you would like to use ChugSplash in production, we'd love to work with you. Please feel free to [join the Discord](https://discord.gg/7Gc3DK33Np) and shoot us a message!

## Maintainers

[@smartcontracts](https://github.com/smartcontracts)\
[@sam-goldman](https://github.com/sam-goldman)\
[@rpate97](https://github.com/RPate97)

## Contributing

Contributors welcome, please read through [CONTRIBUTING.md](https://github.com/chugsplash/chugsplash/blob/develop/CONTRIBUTING.md) for an overview of the contributing process for this repository and to get your development environment up and running. Then check out the list of [Good First Issues](https://github.com/chugsplash/chugsplash/contribute) to find something to work on! If you're not sure where to start, [join the Discord](https://discord.gg/7Gc3DK33Np) and shoot us a message!

## License

MIT © 2022
