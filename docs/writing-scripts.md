# Writing Deployment Scripts with Sphinx

Deployments with Sphinx are nearly identical to deployments with Forge scripts. There are three differences to be aware of:
1. Your deployment is executed by a `SphinxManager` contract instead of a local deployer private key.
2. The `run()` function, which is the entry point for the deployment, must include a `sphinx` modifier.
3. There are a few settings that you must configure in your script.

This guide will explain each of these in detail.

## Table of Contents

- [1. The `SphinxManager` contract](#1-the-sphinxmanager-contract)
- [2. The `sphinx` modifier](#2-the-sphinx-modifier)
- [3. Configuration options](#3-configuration-options)

## 1. The `SphinxManager` contract

The `SphinxManager` contract executes your deployment. It's owned by your project owners. Your project owners must approve a deployment before it can be executed by your `SphinxManager`.

If you're curious how the address of your `SphinxManager` is calculated, see [our FAQ](https://github.com/sphinx-labs/sphinx/blob/develop/docs/faq.md).

If you need to use the address of your `SphinxManager` for any reason, you can retrieve it using a helper function that's inherited from the `Sphinx.sol` contract:

```sol
address manager = sphinxManager();
```

You may need to use the address of your `SphinxManager` to grant it ownership over your contracts in order to execute permissioned actions. If you're doing this, please make sure to transfer ownership of your contracts away from your `SphinxManager` after calling the permissioned functions. This is because the `SphinxManager` is not audited yet. If your contracts currently control any kind of asset, please do not deploy with Sphinx until we get an audit.

## 2. The `sphinx` modifier

The entry point for your deployment must always be a `run()` function that has a `sphinx` modifier:

```sol
function run() public sphinx override {
    ...
}
```

The `sphinx` modifier pranks the `SphinxManager` before your deployment is executed. It also validates your project settings.

## 3. Configuration options

There are a few configuration options that you must specify inside the `setUp()` function in your deployment script. These options all exist on the `sphinxConfig` struct, which is inherited by your script from `Sphinx.sol`.

```sol
function setUp() public {
    // Required configuration options:
    sphinxConfig.projectName = "My Project";
    sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    sphinxConfig.threshold = 1;

    // Sphinx DevOps platform options:
    sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
    sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
    sphinxConfig.orgId = "abcd-1234";
}
```

For a reference guide that describes each of these options, see the [Configuration Reference](https://github.com/sphinx-labs/sphinx/blob/develop/docs/configuration-options.md).
