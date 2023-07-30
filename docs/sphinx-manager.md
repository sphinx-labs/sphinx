# The `SphinxManager` Contract

The `SphinxManager` is a contract that deploys the contracts in a Sphinx config file.

There is one `SphinxManager` contract per project. When a project is deployed on a chain for the first time, a `SphinxManager` must also be deployed. The `SphinxManager` is owned by the user, which grants the user the sole privilege of deploying contracts from their `SphinxManager`.

If a user is deploying a config from the command line, then the owner of the `SphinxManager` is the initial deployer of the project. If a user is instead using Sphinx's DevOps platform, then the owners of the `SphinxManager` are the list of `owners` in the Sphinx config file.

The address of each `SphinxManager` is calculated via `CREATE2` using two inputs:
1. The initial owner(s):
  * If the user is deploying from the command line, then the deployer of the project is the owner.
  * If the user is deploying via the DevOps platform, then the initial list of `owners` in the Sphinx config file own the project.
2. The [`projectName`](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#project-name) in the Sphinx config file.

If you change the owner of the project or the `projectName`, you will be prompted to deploy a new `SphinxManager`. For this reason, you should not change the `projectName` name once you've deployed the project on a live network.
