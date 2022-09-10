# ChugSplash

ChugSplash is a modern smart contract deployment system, currently in development.
We built ChugSplash because we were tired of slow, buggy, and opaque upgrades.
ChugSplash is designed to give you complete confidence throughout the entire smart contract deployment process.

## Why does this exist?

### Your contract deployments need to be secure

- Predictable deployments are secure deployments. You should know exactly what your system is going to look like before you perform an initial deployment or an upgrade. Standard contract deployments are non-deterministic and can lead to dangerous edge-cases when halted mid-deployment. **ChugSplash's fully deterministic deployment process and strong verifiability means you can be confident during every step of a deploy.**
- Every time you touch your private keys is an opportunity for an attack or a mistake. ChugSplash allows you to approve a deployment of any size with a single tiny transaction that you can easily read on the screen of your hardware wallet. This is more secure for smaller projects (less of a chance to sign the wrong thing) and more scalable for larger ones (governance only needs to vote on a single transaction).
- Deployment scripts are vulnerable to random local errors, unexpected bugs, and any number of external attacks. **With ChugSplash you can "fire and forget" — approve a deployment, fund it, and wait for the ChugSplash bot army to trustlessly deploy your new code in a matter of minutes.**

### Your contract deployments need to be verifiable

- You need to distribute your smart contract code to users so that they know what contract they're interacting with. Your dapp isn't really all that decentralized unless users can be sure that a contract is going to behave in the way you claim it'll behave. You also need to be able to distribute your new source code whenever you're planning to do an upgrade to an existing system.
- You should be hosting your source code in a public, decentralized manner. ChugSplash makes decentralized hosting the default. ChugSplash bots will also automatically verify your contract source code on services like Etherscan or Sourcify to make sure your users can see your code where they expect it.
- Once your users have their hands on your source code, they should be able to verify that the source matches what's actually been deployed. **The ChugSplash Explorer website gives your users a dead simple tool for verifying the entirety of an upgrade on the client side.** No more convoluted verification scripts. What you see is what you get.
- Similarly, users should be able to see the exact set of changes that any proposed future upgrade will bring. **ChugSplash makes it possible to view a proposed upgrade as a diff against the existing system.** Users can see the exact lines of code and variables that are going to change. They can also feel confident that the new code they're looking at will actually be the new code that gets deployed.

### Your contract deployments need to be flexible

- ChugSplash stores historical versions of your code so that you'll be able to revert changes if necessary. This also makes it easy for users to see how your system has evolved over time.
- An upgrade system needs to work for projects of any size. ChugSplash is designed to work seamlessly for anyone from smaller projects deploying from a multisig to massive projects that rely on a governance contract.
- A single transaction can be used to authorize a ChugSplash deployment of any size. Whether you're just changing one variable or completely overhauling your entire system, approvals can always be completed in a single transaction.

### Your contract deployments need to be predictable

- Web3 users expect apps to be available 24/7. You should be able to predict the amount of downtime for an upgrade with a high level of confidence. ChugSplash gives you accurate estimates for the time required for an upgrade based on the size of the update and current network congestion.
- Your costs should also be predictable. ETH doesn't grow on trees. **ChugSplash can give you accurate estimates for the total cost of your deployment so you can budget accordingly.**

### Your contract deployments need to be accessible

- If you really want your contracts to be used, you need to maximize for compatibility and composability. ChugSplash automatically distributes the source code and ABI for spec-compliant deployments via `npm` (and eventually other package management systems). It'll even automatically connect your contracts to the right addresses.
- ChugSplash contracts that are distributed via `npm` can also be used directly in your smart contracts. Import any contract directly via the `@chugsplash/registry` package.
- ChugSplash-compatible contracts can easily reference other compatible contracts via the `ChugSplashRegistry` contract. When configuring a deployment, you can simply use the syntax `{{ <deployment name>.<contract name> }}` to reference any contract within any deployment registered in the global `ChugSplashRegistry`.

## Key features

### Declarative deployment configuration

ChugSplash says goodbye to error-prone deployment scripts.
Instead, ChugSplash is based on static configuration files.
Just tell ChugSplash what you want your system to look like and ChugSplash will get you there:

```json
{
  "contracts": {
    "MyToken": {
      "source": "ERC20",
      "variables": {
        "name": "My Token",
        "symbol": "MYT",
        "decimals": 18,
        "totalSupply": 1000,
        "balanceOf": {
          "0x0000000000000000000000000000000000000000": 1000,
        },
      },
    },
    "MyMerkleDistributor": {
      "source": "MerkleDistributor",
      "variables": {
        "token": "{{ MyToken }}",
        "merkleRoot": "0xc24c743268ce26f68cb820c7b58ec4841de32da07de505049b09405e0372cc41"
      }
    }
  },
}
```

Want to do something slightly more complex?
Define your config in TypeScript:

```ts
import { ChugSplashConfig } from '@chugsplash/core'

const totalSupply = 1000
const merkleRoot = ...

const config: ChugSplashConfig = {
  contracts: {
    MyToken: {
      source: 'ERC20',
      variables: {
        name: 'My Token',
        symbol: 'MYT',
        decimals: 18,
        totalSupply: totalSupply,
        balanceOf: {
          '0x0000000000000000000000000000000000000000': totalSupply,
        },
      },
    },
    MyMerkleDistributor: {
      source: 'MerkleDistributor',
      variables: {
        token: '{{ MyToken }}',
        merkleRoot: merkleRoot
      }
    }
  },
}

export default config
```

### The ChugSplash bot army

We built ChugSplash because we never wanted to paste a private key into an `.env` file or approve opaque transaction data on a tiny Ledger screen ever again.
Instead, ChugSplash includes fully automated deployments by default.
As soon as you approve an upgrade, an army of ChugSplash bots will trustlessly and deterministically complete the entire process within minutes.
ChugSplash bots are incentivized to execute your upgrade quickly and efficiently.

### ChugSplash Explorer

Smart contract upgrades today are opaque.
ChugSplash is making them transparent.
ChugSplash deployments need to be proposed before they can be approved.
Before approving a deployment proposal, your team and your users can independently view and verify your upgrade before it actually executes.
Since ChugSplash deployments are fully deterministic, your users will be able to see *exactly* what your system will look like once the upgrade goes through.

The ChugSplash Explorer website aims to make key upgrade information accessible to everyone who needs it.
The Explorer will compile ChugSplash deployments locally and can display key information like the validity of the upgrade, the safety of the upgrade based on certain tools (like OpenZeppelin's storage slot checker), and even the exact line-by-line diff in every modified contract.
No more running complex validation scripts.
Just propose an upgrade, and the ChugSplash Explorer will tell you what that upgrade is about to do *before* it actually does anything.

### Bonus features

ChugSplash bots will carry out extra convenience features on your behalf to make your contract code and interfaces accessible to users and developers who might need them.
Contracts in any ChugSplash deployment are all automatically verified on both [Etherscan](https://etherscan.io) and [Sourcify](https://sourcify.dev/).
ChugSplash will also automatically distribute contract ABIs and source code in the `@chugsplash/registry` package so clients can easily interface with your contract code.

## Project status

ChugSplash is under heavy development.
If you're interested in contributing, please let us know or check out the list of Good First Issues.
