# The `SphinxManager` Contract

The `SphinxManager` is the contract that executes your deployment.

There is one `SphinxManager` contract per project. When a project is deployed on a chain for the first time, a `SphinxManager` is deployed. The `SphinxManager` is owned by the list of owners that you define in your deployment scripts. This grants the owners the sole privilege of deploying contracts from their `SphinxManager`.

The address of each `SphinxManager` is calculated using the following project settings:
- `owners`: The list of addresses that own your project.
- `threshold`: The threshold of owners that must approve the deployment.
- `projectName`: The project name.

You can learn more about these settings in the [Project Settings section of the Configuring Deployments reference guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/configuring-deployments.md#required-configuration-options).
