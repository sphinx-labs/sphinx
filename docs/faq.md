# FAQ

## How does Sphinx deploy and set up Gnosis Safe contracts?

Sphinx uses a single transaction to:
1. Deploy a Gnosis Safe at a deterministic address.
2. Deploy its Sphinx Module at a deterministic address.
3. Enable the module within the Gnosis Safe.

This transaction occurs via `CREATE2` using the following inputs:
* The initial Gnosis Safe owner addresses sorted in ascending order.
* The number of Gnosis Safe owner signatures required to approve transactions.
* Data that deploys a new Sphinx Module and enables the module within the new Gnosis Safe.
* The deployer of the Gnosis Safe. This is a [Gnosis Safe Proxy Factory](https://github.com/safe-global/safe-contracts/blob/v1.3.0-libs.0/contracts/proxies/GnosisSafeProxyFactory.sol), which is a contract developed by the Gnosis Safe team. We use a Gnosis Safe Proxy Factory deployed from [Arachnid's deterministic deployment proxy](https://github.com/Arachnid/deterministic-deployment-proxy), which is the canonical `CREATE2` factory that's deployed on hundreds of chains.

If any of these input parameters change, the Gnosis Safe's address will also change.

We use `CREATE2` to allow anybody to permissionlessly submit this transaction on behalf of the Safe owners without requiring their signatures. If the Safe owners are confident that their Safe has been deployed correctly at a given address on one chain, then they can be confident that a Safe at the **same address** on any other chain has also been deployed correctly.

If you'd like to see exactly how this process works, see the `_sphinxDeployModuleAndGnosisSafe` function in [`Sphinx.sol`](https://github.com/sphinx-labs/sphinx/blob/main/packages/plugins/contracts/foundry/Sphinx.sol).
