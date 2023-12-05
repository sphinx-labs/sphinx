# Sphinx Configuration Options

You must specify these options inside the `setUp()` function in your deployment script. For example:

```sol
function setUp() public {
    sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    ...
}
```

## Table of Contents

TODO(md-end)

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

### `uint256 saltNonce`

A nonce which is one of the inputs that determines the address of a Gnosis Safe. Changing this to a new value will cause a new Gnosis Safe to be deployed. Defaults to `0`.

## DevOps Platform Options

### `string projectName`

```
sphinxConfig.projectName = "My Project";
```

The name of your project, which will appear in the Sphinx UI.

### `string orgId`

```
sphinxConfig.orgId = "abcd-1234";
```

Your organization ID from the Sphinx UI. This is a public field, so you don't need to keep it secret.

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
