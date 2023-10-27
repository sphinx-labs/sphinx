# FAQ

## How are contract addresses determined with Sphinx?

Sphinx uses CREATE3 to deploy your contracts. This means that the creation code of your contract does not impact its address.

The address of each contract is determined by the following inputs:

- Project settings:
  - `owners`: The list of addresses that own your project.
  - `threshold`: The threshold of owners that must approve the deployment.
  - `projectName`: The project name.
Contract deployment options:
- `referenceName`: The string label of your contract.
- `salt`: The 32-byte salt that you input

The project settings determine the address of your [`SphinxManager` contract](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md), which is the contract that executes your deployment. The contract deployment options are specific to each contract deployed by the `SphinxManager`.

If any of these fields change, the addresses of your contracts will also change when you execute a new deployment.

You can learn more about these settings in the "Configuring Deployments" reference:
- [Project settings](https://github.com/sphinx-labs/sphinx/blob/develop/docs/configuring-deployments.md#required-configuration-options)
- [Contract deployment options](https://github.com/sphinx-labs/sphinx/blob/develop/docs/configuring-deployments.md#contract-deployment-options)
