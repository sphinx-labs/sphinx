# How ChugSplash Works

## Enter ChugSplash

ChugSplash lets you:
* Reference contracts using simple template syntax (i.e. `{{ MyContract }}`) instead of keeping track of a web of contract dependencies.

## How ChugSplash Works

The rest of this document will focus on the ChugSplash Core Protocol, which is the open source code that deploys and upgrades your smart contracts.

## The Brief Version

The executor retrieves the deployment info from IPFS, which is committed by the user during the proposal step.

## The Long Version

In order for the executor to complete the deployment remotely, it must be able to fetch the deployment info and re-create the Merkle tree.

To achieve this, the user commits two pieces of information to IPFS during the proposal step: the original ChugSplash config file defined by the user and the compiler inputs of the contracts. This yields an IPFS URI, which is a hash of the committed data.

The remote executor is able to re-create the Merkle tree from these two sources. The compiler inputs allow the executor to optionally verify the smart contracts on block explorers like Etherscan and Sourcify. Since we can't enforce that the executor verifies the contracts on block explorers, we include this feature as part of our Managed Service for free.

In addition to committing this info to IPFS, the user also submits a single `propose` transaction on the project's `ChugSplashManager` contract. There are three inputs to this transaction:

1. The IPFS URI. This allows the executor to fetch the data from IPFS during the execution phase.
2. The root of the Merkle tree. Each Merkle proof supplied by the executor must yield this Merkle root.
3. The number of leafs in the Merkle tree (i.e. the number of `SetStorage` and `DeployImplementation` actions). It's necessary to explicitly specify this to ensure that each action is only executed exactly once.

These three inputs are hashed to yield a 32-byte **bundle ID**, which is the unique identifier for the entire deployment. This bundle will be approved by the project's owner during the next step. It's called a bundle ID because the set of `DeployImplementation` and `SetStorage` actions are referred to as a bundle internally.

As a side effect of using `SetStorage` actions, it becomes easy to view the effects of a proposed upgrade as a git-style diff against the existing system, including state variables, before the upgrade occurs. This specific feature is not available yet, and will be implemented soon.

This entire process occurs in a single `propose` command, which is available as a Hardhat task or as a function in our Foundry library. We recommend that teams integrate proposals into their CI process.

### Approval

Once a team has decided to proceed with a deployment or upgrade, the proposed deployment is approved by the project's owner, which is usually governance or a multisig. This occurs via an `approve` transaction on the project's `ChugSplashManager`. This transaction has a single input: the 32-byte bundle ID created in the proposal step.

### Execution

As soon as the `approve` transaction is submitted, the deployment can be executed by the remote executor, which is constantly listening for new approval events.

Once the executor notices an approval event, it must be able to re-create the Merkle tree in order to execute the deployment. It does this by retrieving the IPFS URI that was submitted on-chain as part of the `propose` transaction. It uses the URI to fetch the ChugSplash config file and the compiler inputs from IPFS. Then, it uses these two sources to re-create the Merkle tree.

The deployment is executed in three phases, which must occur in order:
1. `initiateExecution`: Each proxy's implementation is set `address(0)` in a single transaction at the very beginning. This step is only necessary for contracts that are being upgraded.
2. `executeAction`: The deployment is executed using the `SetStorage` and `DeployImplementation` actions. This can consist of many transactions for a larger deployment.
3. `completeExecution`: Each proxy is upgraded to its new implementation in a single transaction at the very end.

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
