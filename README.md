# ChugSplash

The easiest, fastest, and safest way to deploy and upgrade smart contracts.

ChugSplash is designed to give you complete confidence throughout the entire deployment process. We built ChugSplash because we were tired of slow, buggy, and opaque deployments.

## Table of Contents

- [ChugSplash](#chugsplash)
  - [Table of Contents](#table-of-contents)
  - [Key features](#key-features)
  - [Install](#install)
  - [Usage](#usage)
  - [Tutorial](#tutorial)
  - [Bonus features](#bonus-features)
  - [Coming soon...](#coming-soon)
  - [Reach out](#reach-out)
  - [Maintainers](#maintainers)
  - [Contributing](#contributing)
  - [License](#license)

## Key features

* **Fully deterministic.** Standard contract deployments are non-deterministic and can lead to dangerous edge cases when halted midway. ChugSplash deployments are fully deterministic by default. Additionally, ChugSplash lets you view an exact line-by-line diff of a proposed deployment or upgrade. Since ChugSplash is deterministic, the diff is guaranteed to be applied correctly.
* **Trustless deployments**. Every time you touch your private keys is an opportunity for an attack or a mistake. ChugSplash lets you approve a deployment of any size with a single tiny transaction that fits on the screen of your hardware wallet. ChugSplash will then trustlessly execute your deployment in minutes. No more burner wallets, no more worrying about gas prices, and no more stop-and-go deployments.
* **Define deployments declaratively.** ChugSplash says goodbye to deployment scripts. With ChugSplash, you define your deployments declaratively in a single configuration file. It's like [Terraform](https://www.terraform.io/) for smart contracts. Here's what a deployment looks like:

```ts
const config = {
  contracts: {
    MyToken: {
      source: 'ERC20',
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
      source: 'MerkleDistributor',
      variables: {
        token: '{{ MyToken }}', // Reference another contract's address. No keeping track of contract dependencies!
        merkleRoot: "0xc24c743268ce26f68cb820c7b58ec4841de32da07de505049b09405e0372cc41"
      }
    }
  },
}
```

## Install

With Yarn:
```
yarn add --dev @chugsplash/plugins @chugsplash/core
```

With NPM:
```
yarn add --dev @chugsplash/plugins @chugsplash/core
```

## Usage

In `hardhat.config.ts`, import `chugsplash/plugins`:
```ts
import '@chugsplash/plugins'
```

Update the `outputSelection` setting in `hardhat.config.ts`:
```ts
const config: HardhatUserConfig = {
    ...
    solidity: {
        ...
        settings: {
            // you must include the following
            outputSelection: {
                '*': {
                  '*': ['storageLayout']
                }
            }
        }
    }
}
export default config
```

Create a `chugsplash.config.ts` file:
```ts
import { UserChugSplashConfig } from '@chugsplash/core'

const enum TestEnum {
  'A',
  'B',
  'C',
}

const config: UserChugSplashConfig = {
  // First, set the configuration options for the project.
  options: {
    projectName: 'Project Name',
  },
  // Then create a definition for each contract you would like to deploy
  contracts: {
    // Each definition should have a unique reference name to identify it after deployment
    DeployedSimpleStorage: {
      // You must specify the name of the source contract
      contract: 'SimpleStorage',
      // Finally, specify the state variables you would like to set during the deployment and their values
      variables: {
        // Primitives
        number: 1,
        bool: true,
        string: 'First',
        address: '0x1111111111111111111111111111111111111111',

        // Enums
        enum: SimpleEnum.B,

        // Dynamic & Fixed Arrays
        intArray: [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000],

        // Structs
        complexStruct: {
          a: 1,
          b: {
            1: 'value',
          },
        },

        // Mappings
        intMapping: {
          1: 'value',
          '-1': 'value'
        },
        stringMapping: {
          string: 'value'
        },
        addressMapping: {
          '0x1111111111111111111111111111111111111111': 'value'
        },
        bytesMapping: {
          '0xabcd1234': 'testVal',
        },
        nestedMapping: {
          firstKey: {
            secondKey: 'nestedVal',
          },
        }
      },
    },
  }
}
export default config
```

Start the deployment:
```
npx hardhat chugsplash-deploy chugsplash.config.ts
```

## Tutorial

[Click here](https://github.com/chugsplash/chugsplash/blob/develop/packages/plugins/README.md) for a more comprehensive tutorial.

## Bonus features
* Verifies source code on Etherscan automatically.
* Generates deployment artifacts in the same format as hardhat-deploy.
* Deploys contracts at the same addresses across networks.

## Coming soon...
* ChugSplash will automatically distribute the source code and ABI for deployments via `npm`.

## Reach out

If you need anything before you can start using ChugSplash for your projects, please [reach out](https://discord.com/channels/1053048300565188729/1053048301143986219) and it will be prioritized.

## Maintainers

[@sam-goldman](https://github.com/sam-goldman)
[@rpate97](https://github.com/RPate97)

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © 2022
