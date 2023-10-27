# The `SphinxManager` Contract

The `SphinxManager` is a contract that executes your deployment.

There is one `SphinxManager` contract per project. When a project is deployed on a chain for the first time, a `SphinxManager` must also be deployed. The `SphinxManager` is owned by the user, which grants the user the sole privilege of deploying contracts from their `SphinxManager`.

The address of each `SphinxManager` is calculated via `CREATE2` using two inputs:
1. The list of owners, which you define in the `owners` array in your Sphinx deployment script.
2. The number of owner signatures required to approve a deployment. You define this using the `threshold` parameter in your Sphinx deployment script.
2. The [`projectName`] in your Sphinx deployment Script.

If you change any of these parameters after deploying for the first time on a chain, you will be prompted to deploy a new `SphinxManager`.
