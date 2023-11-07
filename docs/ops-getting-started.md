# The Sphinx DevOps Platform

This guide will introduce you to the Sphinx DevOps platform by walking you through a sample multi-chain deployment. First, you'll initiate a deployment on the command line by proposing it. Then, you'll fund and approve it in the Sphinx UI.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Get testnet ETH](#2-get-testnet-eth)
3. [Get credentials](#3-get-credentials)
4. [Get an RPC endpoint API key](#4-get-an-rpc-endpoint-api-key)
5. [Add environment variables](#5-add-environment-variables)
6. [Configure your script](#6-configure-your-script)
7. [Add RPC endpoints](#7-add-rpc-endpoints)
8. [Propose on testnets](#8-propose-on-testnets)
9. [Propose on mainnet (optional)](#9-propose-on-mainnet-optional)

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

## 4. Get an RPC endpoint API key

We recommend getting a private API key from an RPC node provider like [Alchemy](https://www.alchemy.com/). Public RPC endpoints can be flaky, so we don't recommend them for this guide.

## 5. Add environment variables

In your `.env` file, add your Sphinx API key and your RPC endpoint API key from the previous steps:
```
SPHINX_API_KEY=<your API key>
RPC_API_KEY=<your API key>
```

Also, in your `.env` file, add the private key of your EOA:

```
PROPOSER_PRIVATE_KEY=<private key>
```

We'll use this EOA to propose the deployment on the command line in a later step.

> For the purpose of this guide, we'll use the same EOA to propose the deployment on the command line and approve it in the Sphinx UI. However, in a production environment, we recommend creating a new private key to use specifically for proposals, since the private key will either be stored locally in a `.env` file or as a secret in your CI process.

## 6. Configure your script

First, navigate to your deployment script.

Add the import:
```
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
```

Then, copy and paste the following config template into your `setUp` function:
```
    sphinxConfig.owners = [<your EOA address>];
    sphinxConfig.proposers = [<your EOA address>];
    sphinxConfig.orgId = <org ID>;
    sphinxConfig.projectName = "My First Project";
    sphinxConfig.threshold = 1;
    sphinxConfig.mainnets;
    sphinxConfig.testnets = [
      Network.goerli,
      Network.optimism_goerli,
      Network.arbitrum_goerli
    ];
```

Fill in the template with your values. The `orgId` is a public field, so you don't need to keep it secret.

## 7. Add RPC endpoints

Include an RPC endpoint for each network in your `foundry.toml`. For example, if you're using Alchemy, your `foundry.toml` might look like this:

```
[rpc_endpoints]
goerli = "https://eth-goerli.g.alchemy.com/v2/${RPC_API_KEY}"
optimism_goerli = "https://opt-goerli.g.alchemy.com/v2/${RPC_API_KEY}"
arbitrum_goerli = "https://arb-goerli.g.alchemy.com/v2/${RPC_API_KEY}"
```

## 8. Propose on testnets

Copy and paste the following command, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script:

```
npx sphinx propose <path/to/your-script.s.sol> --testnets
```

Sphinx will propose all transactions that are broadcasted by Foundry.

Follow the instructions in the terminal to finish the rest of the deployment.

## 9. Propose on mainnet (optional)

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
