# Sphinx Configuration Options

You must specify configuration options inside the constructor or `setUp()` function in your deployment script. For example:

```sol
function setUp() public {
    sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    ...
}
```

## Table of Contents

- [Configuration Options](#configuration-options)
  - [`address[] owners`](#address-owners)
  - [`uint256 threshold`](#uint256-threshold)
  - [`string projectName`](#string-projectname)
  - [`uint256 saltNonce`](#uint256-saltnonce)
- [DevOps Platform Options](#devops-platform-options)
  - [`string orgId`](#string-orgid)
  - [`Network[] mainnets`](#network-mainnets)
  - [`Network[] testnets`](#network-testnets)

## Configuration Options

### `address[] owners`
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own your Gnosis Safe. Owners must approve transactions before they can be executed.

### `uint256 threshold`
```
sphinxConfig.threshold = 1;
```

The number of owners required to approve transactions.

### `string projectName`

```
sphinxConfig.projectName = "My_Project";
```

The name of your project, which is the top-level directory for your [deployment artifacts](https://github.com/sphinx-labs/sphinx/blob/main/docs/deployment-artifacts.md).

### `uint256 saltNonce`

An optional nonce which is one of the inputs that determines the `CREATE2` address of a Gnosis Safe. Changing this to a new value will cause a Gnosis Safe to be deployed at a new address. Defaults to `0`.

## DevOps Platform Options

### `string orgId`

```
sphinxConfig.orgId = "abcd-1234";
```

Your organization ID from the Sphinx UI (under "Options" -> "API Credentials"). This is a public field, so you don't need to keep it secret.

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
| Polygon PoS | `Network.polygon` |
| Binance Smart Chain | `Network.bnb` |
| Gnosis Chain | `Network.gnosis` |
| Linea | `Network.linea` |
| Polygon zkEVM | `Network.polygon_zkevm` |
| Avalanche C-Chain | `Network.avalanche` |
| Fantom | `Network.fantom` |
| Base | `Network.base` |
| Scroll | `Network.scroll` |
| Celo | `Network.celo` |
| Moonbeam | `Network.moonbeam` |
| Moonriver | `Network.moonriver` |
| Fuse | `Network.fuse` |
| Evmos | `Network.evmos` |
| Kava | `Network.kava` |
| OKT Chain | `Network.oktc` |

### `Network[] testnets`
```
sphinxConfig.testnets = [Network.sepolia, Network.optimism_sepolia];
```

The list of testnets to deploy on.

Valid values:

| Network | `Network` enum |
| ----------- | ----------- |
| Ethereum Sepolia | `Network.sepolia` |
| Optimism Sepolia | `Network.optimism_sepolia` |
| Arbitrum Sepolia | `Network.arbitrum_sepolia` |
| Polygon Mumbai | `Network.polygon_mumbai` |
| Binance Smart Chain Testnet | `Network.bnb_testnet` |
| Gnosis Chiado | `Network.gnosis_chiado` |
| Linea Goerli | `Network.linea_goerli` |
| Polygon zkEVM Goerli | `Network.polygon_zkevm_goerli` |
| Avalanche Fuji | `Network.avalanche_fuji` |
| Fantom Testnet | `Network.fantom_testnet` |
| Base Sepolia | `Network.base_sepolia` |
| Scroll | `Network.scroll` |
| Celo | `Network.celo` |
| Moonbase Alpha | `Network.moonbase_alpha` |
| Evmos Testnet | `Network.evmos_testnet` |
| Kava Testnet | `Network.kava_testnet` |
