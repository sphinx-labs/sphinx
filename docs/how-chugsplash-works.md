# How ChugSplash Works

First, some history.

The idea for ChugSplash began in December 2020 when [Kelvin Fichter](https://twitter.com/kelvinfichter) and [Mark Tyneway](https://twitter.com/tyneslol) were deploying smart contracts for Optimism. They were frustrated by the fact that they either had to sit around for 30 minutes with a Ledger and *click* *click* *click* on it, or put a deployer private key in memory and hope someone hadn't tricked them into signing something malicious.

This led Kelvin down a rabbit hole where he realized there were all sorts of problems with smart contract deployments and upgrades. These include:
* **Convoluted deployment scripts.** Optimism's L1 deployment scripts span almost [two dozen files](https://github.com/ethereum-optimism/optimism/tree/139874178125bb5983e77495132f3d32db5e4d4c/packages/contracts-bedrock/deploy).
* **Keeping track of contract dependencies.** When the `L1StandardBridge` references the `L1CrossDomainMessenger`, and the `L1CrossDomainMessenger` references the `OptimismPortalProxy`, and the `OptimismPortalProxy` references the `L2OutputOracleProxy`... things can get complicated.
* **Non-deterministic deployment scripts.** Kelvin wanted to guarantee *exactly* what his deployment scripts would do before executing it.
* **Initializer functions.** Uninitialized proxies are often the cause of vulnerabilities on upgradeable contracts.
* **Upgrades halting midway.** This could happen for a number of reasons: a bug in the deployment script, an external attacker, or a spike in the gas price. In any case, the result is the same: a half-completed system which may be in an insecure state.
* **Lack of upgrade visibility.** Kelvin wanted an easy way to view the effects of proposed upgrades before they were approved.

These problems all stem from the same root cause: deployment scripts.

## Enter ChugSplash

ChugSplash is a smart contract deployment framework designed to solve all of these problems.

The key insight of ChugSplash is a **declarative model** in which you define the exact *end state* of your contracts, then let the system get you there. This removes the need for deployment scripts, which follow an **imperative model** where you must specify a series of transactions to get your system to its end state.

ChugSplash's declarative format significantly reduces the amount of code necessary to deploy a set of contracts. ChugSplash transforms Optimism's L1 deployment scripts from [1500+ lines](https://github.com/ethereum-optimism/optimism/tree/sc/ctb-chugsplash/packages/contracts-bedrock/deploy) with hardhat-deploy, or [630 lines](https://gist.github.com/brockelmore/76f445bab01c2479f011e66332df7f82) using Forge scripts, to just over [100 lines](https://github.com/ethereum-optimism/optimism/blob/sc/ctb-chugsplash/packages/contracts-bedrock/chugsplash/mainnet.ts).

ChugSplash lets you:
* Define deployments and upgrades [declaratively](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md#layout-of-a-chugsplash-file) in a single file, inspired by [Terraform](https://www.terraform.io/).
* Guarantee that your deployments and upgrades are fully **deterministic**, meaning they can't be halted for any reason.
* Guarantee that your deployments and upgrades are **atomic**, meaning they're finalized in a single transaction.
* Remove initializer functions from your contracts completely.
* Reference contracts using simple template syntax (i.e. `{{ MyContract }}`) instead of keeping track of a web of contract dependencies.
* Ensure your contract addresses are consistent across networks via `CREATE2`.
* Import your own existing proxies into ChugSplash, including Transparent and UUPS proxies.

The shortcomings of today's deployment tooling has led Kelvin and the other engineers at Optimism to spend months developing internal tooling to ensure that their deployments and upgrades are secure. The alternative is to use open source tools that can be unreliable in a production setting. As a result, Optimism upgrades their contracts once every several months, when they'd rather be performing smaller upgrades once a week.

ChugSplash's goal is to enable teams like Optimism to ship smart contracts quickly and iteratively. We think ChugSplash is the future of safe, easy, and predictable smart contract deployments and upgrades.

The ChugSplash Core Protocol consists of smart contracts that handle the deployment process as well as a Hardhat and Foundry plugin. It's MIT licensed, and all of the code is in this repository.

The ChugSplash Managed Service is built on top of the ChugSplash Core Protocol. The purpose of the Managed Service is to streamline the process of deploying, upgrading, and testing contracts on live networks. It will include features such as:
* Perform live tests against proposed upgrades on a forked chain from your front-end or back-end
* Automatically publish contract ABIs and artifacts to npm. (No more custom publication scripts or manually copying and pasting ABIs!)
* Approve upgrades of any size with a single tiny transaction from governance or a multisig via a UI
* View proposed upgrades as a git-style diff against the existing system (including state variables)
* Perform rollbacks to previous versions of your contracts with a single click
* Automatic Etherscan verification

The managed service is currently in a closed beta. If you'd like to join Optimism and other top protocols in our beta, you can apply [here](https://o7n5gakt66b.typeform.com/to/UoSoli9r). We're accepting only a handful of beta users to ensure that each of them has a great experience.

## How ChugSplash Works

The rest of this document will focus on the ChugSplash Core Protocol, which is the open source code that deploys and upgrades your smart contracts.

> This is about to get technical. You should be proficient with Solidity and have an understanding of upgradeable proxies and Merkle trees.

## The Brief Version

This section will give a brief overview of how ChugSplash achieves the goals outlined above.

**Fully deterministic.** ChugSplash guarantees that your deployments and upgrades cannot halt for any reason because it sets the values of state variables in your proxies via `SSTORE`. We wouldn't be able to make this guarantee if we called functions on the contract because they can contain arbitrary logic (i.e. logic that reverts under certain conditions). Using `SSTORE` also removes the need for initializer functions, which are commonly used by attackers to hijack proxies (including notable vulnerabilities such as the Nomad bridge hack, the $10 million bug bounty paid by Wormhole, and the $2 million bug bounty paid by Arbitrum).

**Atomic upgrades**. ChugSplash sets each proxy's implementation to `address(0)` in a single transaction at the very beginning of an upgrade. Each proxy is upgraded to its new implementation in a single transaction at the very end of the upgrade. This is critical because it ensures end-users aren't interacting with a partially initialized set of smart contracts while the upgrade is occurring.

**Approve deployments or upgrades of any size with a single small transaction from governance or a multisig.** This is possible because ChugSplash uses a network of remote executors that trustlessly complete the deployment or upgrade once the project owner approves it. The executor retrieves the deployment info from IPFS, which is committed by the user during the proposal step.

**Trustless remote execution**. During the proposal step, the user's ChugSplash config file is converted into a Merkle tree where each leaf represents an action to be executed during the deployment or upgrade. More specifically, each leaf either contains a storage slot key/value pair or a contract's creation bytecode. The Merkle root is submitted on-chain by the user during the proposal step, and must be approved by the project owner before being executed. The remote executor must supply the Merkle proof of each leaf in the Merkle tree, or else the transaction will revert. Currently, executors must be whitelisted by ChugSplash. In a future version of ChugSplash, execution will be totally permissionless, meaning anyone can be an executor (and get paid to complete deployments).

## The Long Version

In the next few sections, we'll describe exactly how ChugSplash works by walking through a simple deployment. It's worth noting that the same exact process occurs for both deployments and upgrades.

All of the on-chain logic in the following sections exists in your project's `ChugSplashManager` contract, which is basically a `ProxyAdmin` contract on steroids. The `ChugSplashManager` owns your proxies and is responsible for upgrading them. In turn, you're the owner of the `ChugSplashManager`.

### Defining a Deployment

Say you'd like to deploy the following upgradeable contract using ChugSplash:

```sol
contract MyContract {
  uint256 public myVariable;
}
```

You begin by creating a ChugSplash config file, which contains all of the information necessary to deploy or upgrade a project. The ChugSplash config file for this contract would look something like:

```ts
{
  MyContract: {
    myVariable: 1234
  },
  ... // config options
}
```

### Proposal

During the proposal step, the ChugSplash config file is first converted into a format that can be executed on-chain. There are two components: the contract's state variables and its creation bytecode.

The state variable definitions in the ChugSplash config file are encoded into a series of 32-byte storage slot key/value pairs:

```
[0x000...000, 0x000...04D2]
```

This encoding occurs off-chain using the contract's storage layout.

These key/value pairs, called `SetStorage` actions, are encoded as leafs in a Merkle tree. Additionally, each contract's creation bytecode appended with its constructor arguments is encoded as a leaf in the Merkle tree. These leafs are called `DeployImplementation` actions. The remote executor must supply the Merkle proof of each `SetStorage` and `DeployImplementation` action during the deployment, or else the transaction will revert.

If you're wondering why we use a Merkle tree instead of a simple hash of the deployment, the answer is that using a simple hash would make it impossible to support arbitrarily large deployments. This is because the executor would need to supply the entire deployment's data in a single transaction, which is capped at the block gas limit.

In order for the executor to complete the deployment remotely, it must be able to fetch the deployment info and re-create the Merkle tree.

To achieve this, the user commits two pieces of information to IPFS during the proposal step: the original ChugSplash config file defined by the user and the compiler inputs of the contracts. This yields an IPFS URI, which is a hash of the committed data.

The remote executor is able to re-create the Merkle tree from these two sources. The compiler inputs allow the executor to optionally verify the smart contracts on block explorers like Etherscan and Sourcify. Since we can't enforce that the executor verifies the contracts on block explorers, we include this feature as part of our Managed Service for free.

In addition to committing this info to IPFS, the user also submits a single `propose` transaction on the project's `ChugSplashManager` contract. There are three inputs to this transaction:

1. The IPFS URI. This allows the executor to fetch the data from IPFS during the execution phase.
2. The root of the Merkle tree. Each Merkle proof supplied by the executor must yield this Merkle root.
3. The number of leafs in the Merkle tree (i.e. the number of `SetStorage` and `DeployImplementation` actions). It's necessary to explicitly specify this to ensure that each action is only executed exactly once.

These three inputs are hashed to yield a 32-byte **deployment ID**, which is the unique identifier for the entire deployment. This deployment will be approved by the project's owner during the next step.

As a side effect of using `SetStorage` actions, it becomes easy to view the effects of a proposed upgrade as a git-style diff against the existing system, including state variables, before the upgrade occurs. This specific feature is not available yet, and will be implemented soon.

This entire process occurs in a single `propose` command, which is available as a Hardhat task or as a function in our Foundry library. We recommend that teams integrate proposals into their CI process.

### Approval

Once a team has decided to proceed with a deployment or upgrade, the proposed deployment is approved by the project's owner, which is usually governance or a multisig. This occurs via an `approve` transaction on the project's `ChugSplashManager`. This transaction has a single input: the 32-byte deployment ID created in the proposal step.

### Execution

As soon as the `approve` transaction is submitted, the deployment can be executed by the remote executor, which is constantly listening for new approval events.

Once the executor notices an approval event, it must be able to re-create the Merkle tree in order to execute the deployment. It does this by retrieving the IPFS URI that was submitted on-chain as part of the `propose` transaction. It uses the URI to fetch the ChugSplash config file and the compiler inputs from IPFS. Then, it uses these two sources to re-create the Merkle tree.

The deployment is executed in three phases, which must occur in order:
1. `initiateUpgrade`: Each proxy's implementation is set `address(0)` in a single transaction at the very beginning. This step is only necessary for contracts that are being upgraded.
2. `executeAction`: The deployment is executed using the `SetStorage` and `DeployImplementation` actions. This can consist of many transactions for a larger deployment.
3. `finalizeUpgrade`: Each proxy is upgraded to its new implementation in a single transaction at the very end.

Each of these functions exists on the `ChugSplashManager`. If the executor attempts to send a transaction that isn't in the correct order, the call will revert.

The reason for steps 1 and 3 is to ensure that the deployment or upgrade is **atomic**. This is less important for fresh deployments, but it's critical for upgrades because it ensures end-users aren't interacting with a partially initialized set of smart contracts while the upgrade is occurring.

For every `SetStorage` and `DeployImplementation` action, the executor must submit a corresponding Merkle proof. The root of this Merkle tree was originally supplied by the user in the `propose` step.

You might be wondering how the `SetStorage` actions in step 2 can be executed in a standard proxy, especially if the proxy's implementation is set to `address(0)` in the first step. We achieve this by doing the following in each  `executeAction` transaction:

1. Upgrade the proxy's implementation from `address(0)` to a `ProxyUpdater` contract, which contains just a single function:
```sol
function setStorage(bytes32 _key, bytes32 _value) external {
    assembly {
        sstore(_key, _value)
    }
}
```
2. Trigger the `setStorage` function which is now available on the proxy.
3. Set the proxy's implementation back to `address(0)`.

Since these steps all occur over the course of a *single* transaction, the proxy's implementation is never set to anything other than `address(0)` *between* transactions. This ensures a malicious attacker can't trigger a `setStorage` call on the proxy.

## Wrapping Up

If you have questions or comments, we'd love to hear from you in our [Discord](https://discord.gg/7Gc3DK33Np).

## FAQ

### Why not use multicall from a multisig?

It's feasible to use multicall for smaller deployments or upgrades. However, multicall transactions are capped at the block gas limit, so this doesn't solve the original problem of *click* *click* *clicking* on a Ledger for 30 minutes during a large deployment. Additionally, it becomes difficult to verify the correctness of these enormous transactions on a tiny Ledger screen or a multisig UI. Lastly, using multicall would make it difficult to visualize the effects of an upgrade before it's approved.
