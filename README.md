# ChugSplash

A declarative and deterministic framework for deploying and upgrading smart contracts. Available as a Foundry and Hardhat plugin.

> **WARNING**: The code and contracts ChugSplash uses to deploy and upgrade your contracts HAVE NOT been audited. ChugSplash is a BETA product undergoing significant active development. ChugSplash's behavior and APIs are subject to change at any time at our discretion. You should not use ChugSplash if you would be very upset with your project breaking without notice. We make no guarantees about the safety of any contract deployments using the ChugSplash system.

If you want to use ChugSplash in production, ask a question, or request a feature then we'd love to hear from you in the [Discord!](https://discord.com/invite/CqUPhgRrxq)

## Key Features

- Deploy new upgradeable contracts
- Upgrade existing contracts
- Fully deterministic and idempotent deployments
- Declarative syntax for a better developer experience
- Compatible with contracts deployed using the [OpenZeppelin Hardhat Upgrades API](https://docs.openzeppelin.com/upgrades-plugins/1.x/api-hardhat-upgrades)
- Built-in storage layout safety checker
- Automatically verifies contracts on Etherscan
- Deploys contracts at the same addresses across networks via `CREATE2`
- Generates deployment artifacts in the same format as hardhat-deploy

## Getting Started

### Foundry
[Get started with ChugSplash for Foundry](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/getting-started.md)

### Hardhat
[Get started with ChugSplash for Hardhat](https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/setup-project.md)

## Documentation

- [ChugSplash File](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md): Detailed explanation of the file where you define your deployments and upgrades.
- [Variables Reference](https://github.com/chugsplash/chugsplash/blob/develop/docs/variables.md): Explains how to assign values to every variable type in a ChugSplash file.
- [Storage Layout Safety Checker](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/storage-checker.md): Explains the type of storage layout errors that ChugSplash automatically detects.
- [Using ChugSplash on Live Networks](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/live-network.md): Instructions for using ChugSplash to deploy or upgrade a project on a live network.
- [Import Contracts from the OpenZeppelin Hardhat Upgrades API](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/import-openzeppelin.md).

## Supported Networks

* Ethereum
* Optimism

Test networks:
* Ethereum Goerli
* Optimism Goerli

ChugSplash is capable of supporting any EVM compatible network. If you'd like to use ChugSplash on network that is not listed, please let us know and we'd be happy to take care of deploying the ChugSplash contracts to it.

## Maintainers

[@smartcontracts](https://github.com/smartcontracts)\
[@sam-goldman](https://github.com/sam-goldman)\
[@rpate97](https://github.com/RPate97)

## Contributing

PRs accepted.

## License

MIT © 2022
