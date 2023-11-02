# FAQ

## How is the address of my `SphinxManager` calculated?

The `SphinxManager` is deployed via CREATE2. Its address is determined by the initial values of the following configuration options:
- `owners`: The list of project owner addresses.
- `threshold`: The number of owners that must approve the deployment.
- `projectName`: The name of your project.

You can learn more about these configuration options in the [Writing Deployment Scripts with Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md#required-configuration-options).
