# ChugSplash

A Hardhat and Foundry plugin for deploying and managing upgradeable smart contracts.

If you're using Foundry, check out out our Foundry plugin [here](https://github.com/chugsplash/chugsplash-foundry). Otherwise, keep reading for the Hardhat plugin.

## Table of Contents

- [Features](#key-features)
- [Documentation](#documentation)
- [Reach out](#reach-out)
- [Install](#install)
- [Usage](#usage)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Key features

* **Less code.** ChugSplash significantly reduces the amount of code it takes to deploy contracts. This is because it lets you define your deployments declaratively inside of a single file instead of writing deployment scripts. It's like [Terraform](https://www.terraform.io/) for smart contracts. [Here's a sample deployment](#usage).
* **Faster deployments**. ChugSplash deploys your contracts faster than existing tools. It does this by relying on a network of bots that trustlessly and efficiently complete the entire deployment within minutes. All you need to do is approve the deployment with a single tiny transaction. No burner wallets, no worrying about gas prices, and no stop-and-go deployments.
* **Safe upgrades**. ChugSplash makes it simple to safely upgrade your contracts. It displays the exact variables and lines of code in every modified contract via a git-style diff. Upgrades can be defined in exactly the same declarative format as deployments.
* **Fully secure.** ChugSplash deployments are not prone to dangerous edge cases like normal deployments, which are vulnerable to random local errors, unexpected bugs, and any number of external attacks. Contracts deployed or upgraded using ChugSplash are immune to these issues because ChugSplash is fully deterministic.

### Bonus features

* Verifies source code on Etherscan automatically.
* Deploys contracts at the same addresses across networks via `CREATE2`.
* Generates deployment artifacts in the same format as hardhat-deploy.

## Documentation

1. [Setting up a ChugSplash project](https://github.com/chugsplash/chugsplash/blob/develop/docs/setup-project.md): Take your first steps with ChugSplash.
2. [ChugSplash File](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md): Detailed explanation of the file where you define a deployment or upgrade.
3. [Defining Variables in a ChugSplash File](https://github.com/chugsplash/chugsplash/blob/develop/docs/variables.md): Comprehensive reference that explains how to assign values to every variable type in a ChugSplash file.
4. [Integrating ChugSplash with Foundry](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry.md): Explains how to integrate ChugSplash into an existing Foundry test suite.

## Supported Networks

* Ethereum
* Optimism

Test networks:
* Ethereum Goerli
* Optimism Goerli

## Reach out

If you have questions or want to request a feature, join our [Discord channel](https://discord.com/invite/CqUPhgRrxq)!

## Install

With Yarn:
```
yarn add --dev @chugsplash/plugins @chugsplash/core
```

With NPM:
```
npm install --save-dev @chugsplash/plugins @chugsplash/core
```

## Usage

Define a ChugSplash deployment in `chugsplash.config.ts`:
```ts
import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  contracts: {
    MyToken: {
      contract: 'ERC20',
      variables: {
        name: 'My Token',
        symbol: 'MYT',
        decimals: 18,
        totalSupply: 1000,
        balanceOf: {
          '0x0000000000000000000000000000000000000000': 1000,
        },
      },
    },
    MyMerkleDistributor: {
      contract: 'MerkleDistributor',
      variables: {
        token: '{{ MyToken }}', // MyToken's address. No keeping track of dependencies!
        merkleRoot: "0xc24c743268ce26f68cb820c7b58ec4841de32da07de505049b09405e0372cc41"
      }
    }
  },
}
export default config
```

In `hardhat.config.ts`:
```ts
import '@chugsplash/plugins'

const config: HardhatUserConfig = {
  ... // Other Hardhat settings go here
  solidity: {
    ... // Other Solidity settings go here
    compilers: [
      {
        version: ... , // Solidity compiler version
        settings: {
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
    ]
  }
}

export default config
```

Deploy:
```
npx hardhat chugsplash-deploy --config-path chugsplash.config.ts
```

## Maintainers

[@smartcontracts](https://github.com/smartcontracts)\
[@sam-goldman](https://github.com/sam-goldman)\
[@rpate97](https://github.com/RPate97)

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © 2022
