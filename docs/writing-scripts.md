# Writing Deployment Scripts with Sphinx

Deployments with Sphinx are nearly identical to deployments with Forge scripts. There are three differences to be aware of:
1. Your deployment is executed by a `SphinxManager` contract instead of a local deployer private key.
2. The `run()` function, which is the entry point for the deployment, must include a `sphinx` modifier.
3. There are a few settings that you must configure in your script.

This guide will explain each of these in detail.

## Table of Contents

TODO(md-end)

## 1. The `SphinxManager` contract

The `SphinxManager` contract executes your deployment. It's owned by your project owners. Your project owners must approve a deployment before it can be executed by your `SphinxManager`.

If you're curious how the address of your `SphinxManager` is calculated, see [our FAQ](https://github.com/sphinx-labs/sphinx/blob/develop/docs/faq.md).

If you need to use the address of your `SphinxManager` for any reason, you can retrieve it using a helper function that's inherited from the `Sphinx.sol` contract:

```sol
address manager = sphinxManager(sphinxConfig);
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

There are a few configuration options that you must specify inside the `setUp()` function in your deployment script. These options all exist on the `sphinxConfig` struct, which is automatically inherited by your script.

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

We'll go into detail on each of these below.

### Required Configuration Options

#### `string projectName`
```
sphinxConfig.projectName = "My Project";
```

The name of your project, which can be any name you choose. It's case-sensitive.

#### `address[] owners`
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own this project. Owners must approve deployments before they can be executed.

#### `uint256 threshold`
```
sphinxConfig.threshold = 1;
```

The number of owners required to approve a deployment.

### DevOps Platform Options
There are a few additional options that you'll need to configure before you can use the Sphinx DevOps Platform.

#### `address[] proposers`

```
sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

An array of proposer addresses. We recommend that you use a dedicated EOA for your proposer that does not store any funds and is not used for any other purpose besides proposing.

#### `Network[] mainnets`

```
sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
```

The list of production networks to deploy on.

Valid values:

| Network | `Network` enum |
| ----------- | ----------- |
| Ethereum | `Network.ethereum` |
| Optimism | `Network.optimism` |
| Arbitrum | `Network.arbitrum` |
| Polygon POS | `Network.polygon` |
| Binance Smart Chain | `Network.bnb` |
| Gnosis Chain | `Network.gnosis` |
| Linea | `Network.linea` |
| Polygon ZKEVM | `Network.polygon_zkevm` |
| Avalanche C Chain | `Network.avalanche` |
| Fantom | `Network.fantom` |
| Base | `Network.base` |

#### `Network[] testnets`
```
sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
```

The list of testnets to deploy on.

Valid values:

| Network | `Network` enum |
| ----------- | ----------- |
| Ethereum Goerli | `Network.goerli` |
| Optimism Goerli | `Network.optimism_goerli` |
| Arbitrum Goerli | `Network.arbitrum_goerli` |
| Polygon Mumbai | `Network.polygon_mumbai` |
| Binance Smart Chain Testnet | `Network.bnb_testnet` |
| Gnosis Chiado | `Network.gnosis_chiado` |
| Linea Goerli | `Network.linea_goerli` |
| Polygon ZKEVM Goerli | `Network.polygon_zkevm_goerli` |
| Avalanche Fuji | `Network.avalanche_fuji` |
| Fantom Testnet | `Network.fantom_testnet` |
| Base Goerli | `Network.base_goerli` |

#### `string orgId`

```
sphinxConfig.orgId = "abcd-1234";
```

Your organization ID from the Sphinx UI. This is a public field, so you don't need to keep it secret.
