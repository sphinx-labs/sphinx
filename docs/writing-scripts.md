# Writing Deployment Scripts with Sphinx

This guide covers the essential information for writing deployment scripts with Sphinx. We recommend reading this before using Sphinx in production.

## Table of Contents

- [Your Gnosis Safe](#your-gnosis-safe)
- [The `sphinx` modifier](#the-sphinx-modifier)
- [Configuration options](#configuration-options)
- [Deployment failures](#deployment-failures)
- [Silent transaction failures](#silent-transaction-failures)
- [Script Environment](#script-environment)

## Your Gnosis Safe

On live networks, your deployment will be executed from your Gnosis Safe. In other words, the `msg.sender` of your transactions will be your Gnosis Safe.

If you need to use your Gnosis Safe's address in your deployment script, you can use the following helper function, which is inherited from the `Sphinx.sol` contract:

```sol
address safe = safeAddress();
```

## The `sphinx` modifier

The entry point function in your script must always have a `sphinx` modifier. For example:

```sol
function run() public sphinx {
    ...
}
```

The `sphinx` modifier pranks your Gnosis Safe before your deployment is executed. This ensures that the script replicates the deployment process on live networks. The modifier also validates the project settings in your `sphinxConfig` struct.

## Configuration options

There are a few configuration options that you must specify inside a `configureSphinx()` function in your deployment script. The `configureSphinx()` function is a virtual function on `Sphinx.sol`, so you will be required to implement it or your script will not compile. The options all exist on the `sphinxConfig` struct, which is also inherited from `Sphinx.sol`.

```
function configureSphinx() public override {
    // Required settings:
    sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    sphinxConfig.threshold = 1;
    sphinxConfig.projectName = "My_Project";

    // Required settings for the Sphinx DevOps Platform:
    sphinxConfig.orgId = "abcd-1234";
}
```

See the [Configuration Reference](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md) if you'd like to learn more about these fields.

## Deployment failures

Sphinx simulates your deployment during the proposal step to reduce the chance of a transaction reverting on-chain. However, this doesn't completely eliminate the possibility that a transaction can revert during the deployment. If a transaction reverts, the deployment will fail. This means the executor won't be able to submit any further transactions for the deployment or attempt to re-submit the transaction that reverted.

A couple of important points to note:
* If a transaction reverts, this does _not_ undo any transactions in the deployment that have already succeeded.
* A transaction that reverts on one network does _not_ interfere with the deployment process on other networks during a multi-chain deployment. This means it's possible for a deployment to fail on one network but succeed on every other network.

## Silent transaction failures

As any Solidity developer knows, smart contracts generally revert upon failure. However, sometimes smart contract functions will be designed to return a value to indicate failure instead of reverting. A common example is the [ERC20 `transferFrom` function](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#IERC20-transferFrom-address-address-uint256-), which returns `false` if a transfer fails instead of reverting.

With Sphinx, a deployment will only fail if a transaction reverts. This means that if a transaction returns a success condition instead of reverting, the deployment will _not_ fail, and the executor will continue to submit transactions for the deployment.

If you want to avoid this behavior, we recommend designing your smart contracts so that they revert upon failure. For example, OpenZeppelin prevents the silent failure described above with their [`SafeERC20`](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20) contract, which reverts if an operation fails.

## Script Environment
When deploying with Sphinx via either the `propose` or `deploy` CLI commands, Sphinx will invoke your Forge script on your behalf. When the script runs, we configure a few options and environment variables by default.

Sphinx sets the `FOUNDRY_SENDER` environment variable to the address of your Gnosis Safe. Sphinx also uses the `--always_use_create_2_factory` CLI flag, which causes CREATE2 deployments to occur via the default CREATE2 factory.
