# The Sphinx DevOps Platform

This guide will introduce you to the Sphinx DevOps platform by walking you through a sample multi-chain deployment. First, you'll initiate a deployment on the command line by proposing it. Then, you'll fund and approve it in the Sphinx UI.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Get testnet ETH](#2-get-testnet-eth)
3. [Get credentials](#3-get-credentials)
4. [Add your credentials](#4-add-your-credentials)
5. [Configure your script](#5-configure-your-script)
6. [Add RPC endpoints](#6-add-rpc-endpoints)
7. [Propose on testnets](#7-propose-on-testnets)
8. [Propose on mainnet (optional)](#8-propose-on-mainnet-optional)

## 1. Prerequisites

Sphinx is currently invite-only. You must receive an invite link to follow along with this guide. [Request access in the Sphinx UI.](https://sphinx.dev)

Make sure that you've already completed one of the following guides:

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)

Also, you'll need an Externally Owned Account (EOA) that exists on live networks.

## 2. Get testnet ETH

You'll need a small amount of testnet ETH on Optimism Goerli, which you can get at [Optimism's faucet](https://app.optimism.io/faucet).

## 3. Get credentials

You'll need a Sphinx API key and an organization ID. You can get these on the [Sphinx UI](https://www.sphinx.dev/).

## 4. Add your credentials

In your `.env` file, add your Sphinx API key from the previous step:
```
SPHINX_API_KEY=<your API key>
```

Also, in your `.env` file, add the private key of your EOA:

```
PROPOSER_PRIVATE_KEY=<private key>
```

We'll use this EOA to propose the deployment on the command line in a later step.

## 5. Configure your script

Navigate to your deployment script.

First, add the import:
```
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
```

In your `setUp` function, update the `sphinxConfig.owners` array to include the address of your EOA:

```
sphinxConfig.owners = [<your EOA address>];
```

Then, copy and paste the following config options into your `setUp` function:
```
sphinxConfig.orgId = <org ID>;
sphinxConfig.proposers = [<your proposer address>];
sphinxConfig.mainnets = [];
sphinxConfig.testnets = [
  Network.goerli,
  Network.optimism_goerli,
  Network.arbitrum_goerli,
  Network.polygon_mumbai,
  Network.bnb_testnet,
  Network.gnosis_chiado
];
```

Set the `sphinxConfig.orgId` field to the organization ID that you got from the Sphinx UI, and set the `sphinxConfig.proposers` array to include the address of your EOA.

## 6. Add RPC endpoints

You'll need to update your `foundry.toml` to include an RPC endpoint for each network. You can use these public RPC endpoints:

```toml
[rpc_endpoints]
goerli = "https://rpc.ankr.com/eth_goerli"
optimism_goerli = "https://rpc.ankr.com/optimism_testnet/"
arbitrum_goerli = "https://goerli-rollup.arbitrum.io/rpc"
bnb_testnet = "https://bsc-testnet.publicnode.com"
gnosis_chiado = "https://rpc.chiadochain.net"
polygon_mumbai = "https://rpc.ankr.com/polygon_mumbai"
```

## 7. Propose on testnets

Copy and paste the following command, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script:

```
npx sphinx propose <path/to/your-script.s.sol> --testnets
```

Sphinx will propose all transactions that are broadcasted by Foundry.

Follow the instructions in the terminal to finish the rest of the deployment.

## 8. Propose on mainnet (optional)

To propose a deployment on mainnet, you simply need to add a `sphinxConfig.mainnets` option to the `setUp` function in your deployment script. For example:
```
sphinxConfig.mainnets = [
  Network.optimism
]
```

Then, propose using the `--mainnets` option, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script:
```
npx sphinx propose <path/to/your-script.s.sol> --mainnets
```

Follow the instructions in the terminal to finish the rest of the deployment.
