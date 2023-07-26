# Sphinx Config File

The Sphinx config file is where you define smart contract deployments for a project. It can be
written in either TypeScript or JavaScript. For users of the DevOps platform, the config is also
where you define the settings of your project, such as the list of networks to deploy on.

## Table of Contents

- [Layout of a config file](#layout-of-a-config-file)
- [Project name](#project-name)
- [Options](#options)
- [Contracts](#contracts)
  - [Reference names](#reference-names)
  - [Contract definitions](#contract-definitions)

## Layout of a config file

A config file looks like this:
```js
{
  // Project name
  projectName: 'MyProject',

  // Options (only for DevOps users):
  options: {
    orgId: 'my-org',
    testnets: ['goerli', 'optimism-goerli'],
    mainnets: ['ethereum', 'optimism'],
    owners: ['0x11111...'],
    threshold: 3,
    proposers: ['0x9999...'],
  },

  // Contract definitions:
  contracts: {
    // First contract
    ContractOne: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
        _contractOne: '{{ ContractOne }}', // Address of ContractOne
      },
    },
    // Second contract
    ContractTwo: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 2,
        _contractOne: '{{ ContractOne }}', // Address of ContractOne
      },
    },
    // Additional contracts go here:
    // ...
  },
}
```

We'll describe each of these fields in detail below.

## Project name

```js
projectName: 'MyProject',
```

The `projectName` is the name of your project. It can be any name you choose. Note that the project name is case-sensitive.

You should not change the project name once you've deployed a project on a live network. This is because a new `SphinxManager` contract will be deployed. See [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md) for more info on the `SphinxManager`.

Note that the `projectName` is case-sensitive.

## Options

This section is only relevant for users of the Sphinx DevOps platform.

The `options` field contains the settings for your Sphinx project. It looks like this:
```js
options: {
  orgId: 'my-org',
  testnets: ['goerli', 'optimism-goerli'],
  mainnets: ['ethereum', 'optimism'],
  owners: ['0x11111...', '0x22222...', ...],
  threshold: 3,
  proposers: ['0x9999...'],
},
```

It contains the following fields:
* `orgId`: The ID of your Sphinx organization. It's assigned to you when you create an organization on the Sphinx DevOps platform. This is a public field, so it's fine to commit it to version control.
* `mainnets`: The list of mainnets that your project will be deployed on. Valid fields:
  * Ethereum: `'ethereum'`
  * Optimism: `'optimism'`
  * Arbitrum: `'arbitrum'`
  * Polygon: `'matic'`
  * BNB Smart Chain (aka BSC): `'bnb'`
  * Gnosis Chain: `'xdai'`
* `testnets`: The list of testnets that your project will be deployed on. Valid fields:
  * Ethereum Goerli: `'goerli'`
  * Optimism Goerli: `'optimism-goerli'`
  * Arbitrum Goerli: `'arbitrum-goerli'`
  * Polygon Mumbai: `'maticmum'`
  * BNB Smart Chain Testnet: `'bnbt'`
  * Gnosis Chiado: `'gnosis-chiado'`
* `owners`: The list of addresses that own this project. Owners can perform permissioned actions such as approving deployments via the Sphinx UI. We currently only support projects that are owned by a single account.
* `threshold`: The number of owners that must sign a permissioned action, such as approving a deployment, before the action can be executed on-chain.
* `proposers`: The list of addresses that are allowed to propose changes to the Sphinx config file. Any change to the Sphinx config file, including deploying contracts, must be proposed before it can be approved by the project owners. Since proposals are triggered from the CLI, we recommend that proposers are hot wallets, i.e. a wallet that you feel comfortable pasting its private key into a `.env` file. We currently only support projects that have a single proposer, which must be the same address as the owner.

## Contracts

This section contains the deployment info for all of the contracts in your project.

```js
contracts: {
  // First contract
  ContractOne: {
    contract: 'HelloSphinx',
    kind: 'immutable',
    constructorArgs: {
      _number: 1,
      _contractOne: '{{ ContractOne }}', // Address of ContractOne
    },
  },
  // Second contract
  ContractTwo: {
    contract: 'HelloSphinx',
    kind: 'immutable',
    constructorArgs: {
      _number: 2,
      _contractOne: '{{ ContractOne }}', // Address of ContractOne
    },
  },
  // Additional contracts go here:
  // ...
},
```

### Reference names

Each contract definition is keyed by a **reference name**, which uniquely identifies each contract. A reference name can be any name you choose. In the sample Sphinx config above, the first contract's reference name is `ContractOne`, and the second contract's reference name is `ContractTwo`.

### Contract definitions

Each contract definition has the following fields:

* `contract`: The name of the contract in your Solidity source file. In the sample Sphinx config above, both contracts are named `HelloSphinx`.
* `kind`: The kind of contract you're deploying. Sphinx only supports `immutable` contract kinds, but it will support more kinds in the future, such as Transparent proxies.
* `constructorArgs`: Object containing the contract's constructor arguments and their values. In the sample Sphinx config above, both contracts have a constructor argument named `_number` with a value of `1` and `2`, respectively. Both contracts also use a _contract reference_ as the value of the constructor argument `_contractOne`. The contract reference `{{ ContractOne }}` equals the address of `ContractOne`. To learn more about how to define constructor arguments of every variable type, including contract references, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/constructor-args.md).
