# ChugSplash

ChugSplash makes it easy to deploy and upgrade smart contracts **securely**. It's designed for deployments that are complex or high-risk.

## Table of Contents

- [Features](#key-features)
- [Documentation](#documentation)
- [Reach out](#reach-out)
- [Install](#install)
- [Usage](#usage)
- [Tutorial](#tutorial)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Key features

* **Less code.** ChugSplash significantly reduces the amount of code it takes to deploy contracts. This is because it lets you define your deployments declaratively inside of a single file instead of writing deployment scripts. It's like [Terraform](https://www.terraform.io/) for smart contracts. [Here's a sample deployment](#usage).
* **Faster deployments**. ChugSplash deploys your contracts faster than existing tools. It does this by relying on a network of bots that trustlessly and efficiently complete the entire deployment within minutes. All you need to do is approve the deployment with a single tiny transaction. No burner wallets, no worrying about gas prices, and no stop-and-go deployments.
* **Safe upgrades**. ChugSplash makes it simple to safely upgrade your contracts. It displays the exact variables and lines of code in every modified contract via a git-style diff. Upgrades can be defined in exactly the same declarative format as deployments.
* **Fully secure.** ChugSplash deployments are not prone to dangerous edge cases like normal deployments. Standard deployment scripts are vulnerable to random local errors, unexpected bugs, and any number of external attacks. Contracts deployed or upgraded using ChugSplash are immune to these dangers because ChugSplash is fully deterministic.

### Bonus features

* Verifies source code on Etherscan automatically.
* Deploys contracts at the same addresses across networks via `CREATE2`.
* Generates deployment artifacts in the same format as hardhat-deploy.

## Documentation

1. [ChugSplash File](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md): Detailed explanation of the file where you define a deployment or upgrade. Start here.
2. [Defining Variables in a ChugSplash File](https://github.com/chugsplash/chugsplash/blob/develop/docs/variables.md): Comprehensive reference that explains how to assign values to every variable type in a ChugSplash file.

## Reach out

If you have questions or want to request a feature, join our [Discord channel](https://discord.com/channels/1053048300565188729/1053048301143986219)!

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
// Import ChugSplash
import '@chugsplash/plugins'

// Update the `outputSelection` setting
const config: HardhatUserConfig = {
    ...
    solidity: {
        ...
        settings: {
            outputSelection: {
                '*': {
                  '*': ['storageLayout']
                }
            }
        }
    }
}
```

Deploy:
```
npx hardhat chugsplash-deploy --config-path chugsplash.config.ts
```

## Tutorial

[Click here](https://github.com/chugsplash/chugsplash/blob/develop/packages/plugins/README.md) for a more comprehensive tutorial.

## Maintainers

[@smartcontracts](https://github.com/smartcontracts)\
[@sam-goldman](https://github.com/sam-goldman)\
[@rpate97](https://github.com/RPate97)

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © 2022
