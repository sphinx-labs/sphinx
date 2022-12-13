# ChugSplash

ChugSplash is the easiest, fastest, and safest to deploy and upgrade smart contracts. We built ChugSplash because we were tired of slow, buggy, and opaque deployments.

## Key features

* **Trustless deployments**. Every time you touch your private keys is an opportunity for an attack or a mistake. ChugSplash lets you approve a deployment of any size with a single tiny transaction that fits on the screen of your hardware wallet. ChugSplash will then trustlessly execute your deployment in minutes. No more burner wallets, no more worrying about gas prices, and no more stop-and-go deployments.
* **Fully deterministic.** Standard contract deployments are non-deterministic and can lead to dangerous edge cases when halted midway. ChugSplash deployments are fully deterministic by default. Additionally, ChugSplash lets you view an exact line-by-line diff of an upgrade before it's executed. Since ChugSplash is deterministic, the diff is guaranteed to be applied correctly.
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

## Bonus features
* Verifies source code on Etherscan automatically.
* Generates deployment artifacts in the same format as hardhat-deploy.
* Deploys contracts at the same addresses across networks.

## Tutorial

[Click here](https://github.com/chugsplash/chugsplash/blob/develop/packages/plugins/README.md) for a tutorial.

## Coming soon...
* ChugSplash will automatically distribute the source code and ABI for deployments via `npm`.

## Reach out

If you need anything before you can start using ChugSplash for your projects, please reach out to [@samgoldman0](https://t.me/samgoldman0) on Telegram and it will be prioritized.
