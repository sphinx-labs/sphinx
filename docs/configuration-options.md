# Sphinx Configuration Options

You must specify configuration options inside the `configureSphinx()` function in your deployment script. For example:

```sol
function configureSphinx() public override {
    sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    ...
}
```

## Table of Contents

- [Configuration Options](#configuration-options)
  - [`address[] owners`](#address-owners-required)
  - [`uint256 threshold`](#uint256-threshold-required)
  - [`string projectName`](#string-projectname-required)
  - [`uint256 saltNonce`](#uint256-saltnonce-required)
- [DevOps Platform Options](#devops-platform-options)
  - [`string orgId`](#string-orgid-required)
  - [`string[] mainnets`](#string-mainnets-optional)
  - [`string[] testnets`](#string-testnets-optional)

## Configuration Options

### `address[] owners` (Required)
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own your Gnosis Safe. Owners must approve transactions before they can be executed.

### `uint256 threshold` (Required)
```
sphinxConfig.threshold = 1;
```

The number of owners required to approve transactions.

### `string projectName` (Required)

```
sphinxConfig.projectName = "My_Project";
```

The name of your project, which is the top-level directory for your [deployment artifacts](https://github.com/sphinx-labs/sphinx/blob/main/docs/deployment-artifacts.md).

### `uint256 saltNonce` (Required)

An optional nonce which is one of the inputs that determines the `CREATE2` address of a Gnosis Safe. Changing this to a new value will cause a Gnosis Safe to be deployed at a new address. Defaults to `0`.

## DevOps Platform Options

### `string orgId` (Required)

```
sphinxConfig.orgId = "abcd-1234";
```

Your organization ID from the Sphinx UI (under "Options" -> "API Credentials"). This is a public field, so you don't need to keep it secret.

### `string[] mainnets` (Optional)

```
sphinxConfig.mainnets = ["ethereum", "optimism", "arbitrum"];
```

A list of production networks to propose on via the `--networks mainnets` flag. Provides a convenient way to propose on many networks without specifying them on the command line. Note that the strings in this array must match the network names in the `rpc_endpoints` section of your `foundry.toml` file.

### `string[] testnets` (Optional)

```
sphinxConfig.testnets = ["ethereum_sepolia", "optimism_sepolia", "arbitrum_sepolia"];
```

A list of test networks to propose on via the `--networks testnets` flag. Provides a convenient way to propose on many networks without specifying them on the command line. Note that the strings in this array must match the network names in the `rpc_endpoints` section of your `foundry.toml` file.
