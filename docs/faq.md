# FAQ

### How do I deploy a contract when another contract already exists at its `CREATE3` address?

Sphinx detects this situation and outputs the following message in the diff:
```bash
Skipping:
Reason: Contract already deployed at the Create3 address.
Contract(s):
...
```

To deploy a new contract, you must change its `CREATE3` address. There are two ways to do this:
1. (Recommended): Add a `salt` to the contract definition in the Sphinx config file. For more info on the `salt`, see [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#contract-definitions).
2. Change the reference name of the contract. For more info on reference names, see [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#reference-names).
