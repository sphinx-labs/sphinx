# Introduction

This document gives an overview of ChugSplash to provide context for the rest of the specification. This document omits details in favor of describing the key concepts at a high level.

Throughout this document and the rest of the specification, the term "deployment" and "upgrade" are used interchangeably. This is because ChugSplash is designed specifically for upgradeable contracts. In practice, the same exact process occurs when deploying a new upgradeable contract and upgrading an existing one.

## Defining a Deployment

We start with a simple contract, which will exist behind a standard EIP-1967 proxy.

```sol
contract MyContract {
  uint8 public myNum;
}
```

Notice that this contract does not contain a constructor or initializer function.

To deploy this contract, the user defines a declarative configuration file (also known as a config file). The config file contains the information necessary to deploy all of the contracts in a project. A simplified version of the config for this project would look like:

```ts
{
  MyContract: {
    variables: {
      myNum: 255
    }
  },
}
```

## Validation and Parsing

First, the config file is validated and parsed off-chain. Some examples of actions that occur during this step:
* **Validate variable names.** For example, if the user mistakenly defines a variable named `myString` instead of `myNum` in the config file, an error will be thrown here.
* **Validate variable values.** For example, if `myNum` is set to `"abc"` instead of an integer in the config file, an error will be thrown here.
* **Parse variable values.** Each variable type is converted into a standard format. For `int` types, this format is a string. So, `myNum` will be converted to `"255"`.

There is more validation and parsing that occurs other than these examples, but this is the general idea.

## Encoding State Variables

Next, the state variable definitions in the config are encoded into a format that can be executed deterministically on-chain.

To guarantee that deployments are deterministic, ChugSplash does not use constructors or initializer functions. This is because they may contain arbitrary logic that reverts under certain conditions or yields an unpredictable result. Initializer functions are also used by attackers to hijack proxies (including notable vulnerabilities such as the Nomad bridge hack, the $10 million bug bounty paid by Wormhole, and the $2 million bug bounty paid by Arbitrum).

Instead of using constructors or initializers, ChugSplash sets the values of variables in proxies via `SSTORE`.

Each state variable definition is converted into a **storage slot segment** (also known as a segment):

```ts
type StorageSlotSegment {
  key: string
  offset: number
  val: string
}
```

The segment that corresponds to `myNum: 255` would be:

```ts
{
  key: "0x000...000",
  offset: 0,
  val: "0xff" // 1 byte since myNum is uint8
}
```

The variable encoding process uses the contract's storage layout, and operates according to Solidity's [storage layout rules](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html). ChugSplash can encode any variable type, including mappings, arrays, and arbitrarily nested values (e.g. a mapping inside a struct inside an array).

## Trustless Execution

ChugSplash allows developers to deploy contracts from the command line in the same manner as traditional tools.

Alternatively, teams can approve a deployment by submitting a single tiny transaction on-chain from their multisig. Once this transaction occurs, a remote executor trustlessly completes the deployment on behalf of the team. In order for this process to be trustless, the encoded config is converted into a Merkle tree, known as an **action bundle**.

An action bundle's leafs are known as **actions**. There are two types of actions:
1. `SET_STORAGE`: Sets a state variable in a proxy using a [storage slot segment](TODO).
2. `DEPLOY_CONTRACT`: Deploys a contract's bytecode.

During the approval step, the project owner approves the action bundle's Merkle root (in addition to a few other pieces of info). The remote executor must supply the Merkle proof of each action during the deployment, or else the transaction will revert. This prevents the executor from supplying incorrect actions.

In the current version of ChugSplash, the remote executor is either the ChugSplash team or another whitelisted party. In a future version of ChugSplash, execution will be totally permissionless, which will allow anyone to get paid to execute deployments on behalf of users.

## The `ChugSplashManager`

All of the on-chain activity for a project occurs in a `ChugSplashManager` contract. Each team has a single `ChugSplashManager`, which is owned exclusively by them. This contract is similar to the `ProxyAdmin` contract used by OpenZeppelin's Upgrades Plugin in the sense that the `ChugSplashManager` owns a team's proxies, and, in turn, the team owns the `ChugSplashManager`. However, the `ChugSplashManager` has additional functionality that does not exist in a `ProxyAdmin`.

The `ChugSplashManager` contains the logic for:
* Proposing deployments.
* Approving deployments via a multisig or governance.
* Executing deployments via the project owner or trustlessly via a remote executor.
* Paying the remote executor for deploying a project.
* Exporting proxies out of the ChugSplash system.

The `ChugSplashManager` is designed to be extensible to new proxy types. It currently supports Transparent and UUPS proxies, including those that have been deployed using OpenZeppelin's Upgrades Plugin.

## Execution

A deployment is executed in three phases, which must occur in order. These steps ensure that execution is **atomic**, which means the proxies are upgraded as a single unit.

The steps are:
1. **Initiate execution**: In the first transaction, all of the proxies in the config are disabled by setting their implementations to a contract that can only be called by the team's `ChugSplashManager` contract. This prevents end-users from interacting with the smart contracts while the upgrade is occurring. Although this step is only necessary for contracts that are being upgraded, it occurs for fresh deployments too.
2. **Execute actions**: The deployment is executed using the `SetStorage` and `DeployImplementation` actions. This can consist of many transactions for a larger deployment.
3. **Complete execution**: Each proxy is upgraded to its new implementation in a single transaction at the end of the deployment.

