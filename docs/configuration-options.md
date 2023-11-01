# Configuration Options

This reference guide will explain all of the Sphinx configuration options.

You must specify these options inside the `setUp()` function in your deployment script. For example:

```sol
function setUp() public {
    sphinxConfig.projectName = "My Project";
    ...
}
```

## Table of Contents

- [Required Configuration Options](#required-configuration-options)
  - [`string projectName`](#string-projectname)
  - [`address[] owners`](#address-owners)
  - [`uint256 threshold`](#uint256-threshold)
- [DevOps Platform Options](#devops-platform-options)
  - [`address[] proposers`](#address-proposers)
  - [`Network[] mainnets`](#network-mainnets)
  - [`Network[] testnets`](#network-testnets)
  - [`string orgId`](#string-orgid)

## Required Configuration Options

### `string projectName`
```
sphinxConfig.projectName = "My Project";
```

The name of your project, which can be any name you choose. It's case-sensitive.

### `address[] owners`
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own this project. Owners must approve deployments before they can be executed.

### `uint256 threshold`
```
sphinxConfig.threshold = 1;
```

The number of owners required to approve a deployment.

## DevOps Platform Options
There are a few additional options that you'll need to configure before you can use the Sphinx DevOps Platform.

### `address[] proposers`

```
sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

An array of proposer addresses. We recommend that you use a dedicated EOA for your proposer that does not store any funds and is not used for any other purpose besides proposing.

### `Network[] mainnets`

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

### `Network[] testnets`
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

### `string orgId`

```
sphinxConfig.orgId = "abcd-1234";
```

Your organization ID from the Sphinx UI. This is a public field, so you don't need to keep it secret.
