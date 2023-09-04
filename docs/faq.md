# FAQ

### Why is Sphinx skipping a contract deployment or function call?

With Sphinx, contract deployments and function calls are idempotent. This means that they'll only be executed once per chain, even if you re-deploy your config file.

If you'd like to re-deploy a contract instead of skipping it, you must change its `CREATE3` address. There are two ways to do this:
1. (Recommended): Add a `salt` to the contract definition in the Sphinx config file. For more info on the `salt`, see [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#contract-definitions).
2. Change the reference name of the contract. For more info on reference names, see [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#reference-names).
