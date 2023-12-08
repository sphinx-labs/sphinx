# Writing Deployment Scripts with Sphinx

This guide serves two purposes:

1. It covers the differences between Sphinx deployment scripts and Forge scripts. (There are only a couple minor differences).
2. It covers some other essential information for using Sphinx.

## Table of Contents

TODO(md-end)

### 1. The `sphinx` modifier

The entry point for your deployment must always be a `run()` function that has a `sphinx` modifier:

```sol
function run() public sphinx override {
    ...
}
```

The `sphinx` modifier pranks your Gnosis Safe before your deployment is executed. This ensures that the script replicates the deployment process on live networks. The modifier also validates your project settings.

### 2. Configuration options

There are a few configuration options that you must specify inside the `setUp()` function in your deployment script. These options all exist on the `sphinxConfig` struct, which is inherited by your script from `Sphinx.sol`.

```sol
function setUp() public {
    // Required configuration options:
    sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    sphinxConfig.threshold = 1;

    // Sphinx DevOps platform options:
    sphinxConfig.projectName = "My Project";
    sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
    sphinxConfig.testnets = [Network.sepolia, Network.arbitrum_sepolia];
    sphinxConfig.orgId = "abcd-1234";
}
```

See the [Configuration Reference](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md) to learn about these fields in more detail.

### 3. Your Gnosis Safe address

If you need to use the address of your Gnosis Safe in your deployment script, you can use the following helper function, which is inherited from the `Sphinx.sol` contract:

```sol
address safe = sphinxSafe();
```
