# Sphinx DevOps Platform

This guide will introduce you to the Sphinx DevOps platform by walking you through a sample multi-chain deployment.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [High-level overview](#2-high-level-overview)
3. [Get testnet ETH on Optimism Goerli](#3-get-testnet-eth-on-optimism-goerli)
4. [Get your credentials](#4-get-your-credentials)
5. [Set environment variables](#5-set-environment-variables)
6. [Configure your script](#6-configure-your-script)
7. [Add RPC endpoints](#7-add-rpc-endpoints)
8. [Propose the deployment](#8-propose-the-deployment)

## 1. Prerequisites

Make sure that you've already completed one of the following guides:

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md)

Also, you'll need an Externally Owned Account (EOA) that exists on live networks.

## 2. High-level overview

To give some context on the deployment process, here's a high-level overview of how it works.

Deployments are a three-step process with the DevOps platform.

1. **Proposal**: The deployment is proposed on the command line or in a CI process. This creates a meta transaction that's signed by the proposer then relayed to Sphinx's back-end. We'll propose the deployment on the command line in this guide.
2. **Approval**: The project owner(s) sign a meta transaction to approve the deployment in the Sphinx UI.
3. **Execution**: The deployment is executed on-chain by a relayer. In order to execute the deployment, the relayer must submit both the meta transaction signed by the proposer and the owners.

## 3. Get testnet ETH on Optimism Goerli

You'll need a small amount of testnet ETH on Optimism Goerli, which you can get at [their faucet](https://app.optimism.io/faucet). Later, you'll use this ETH to deploy a `SphinxBalance` contract. You'll cover the cost of your deployments by depositing USDC into this contract before execution. On testnets, you must fund your deployments in USDC on Optimism Goerli. Likewise, on production networks, you must fund your deployments in USDC on Optimism Mainnet. We'll provide you with free USDC on Optimism Goerli to fund your deployments on testnets.

## 4. Get your credentials

You'll need a Sphinx API key and an organization ID. You can get these in the [Sphinx DevOps platform](https://www.sphinx.dev/).

## 5. Set environment variables

Navigate to the repository that contains the script you'd like to deploy.

In your `.env` file, enter the following fields:
```
SPHINX_API_KEY=<your API key>
PROPOSER_PRIVATE_KEY=<proposer private key>
```

## 6. Configure your script

Open your deployment script.

In your `setUp` function, update the `owners` array to include the address of your EOA.

Then, copy and paste the following config options into your `setUp` function:
```
sphinxConfig.orgId = "<org ID>";
sphinxConfig.proposers = [<your address>];
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

Fill in the org ID and proposer with your values. You can leave the `mainnets` array empty because we'll only be deploying on testnets in this guide. You can learn more about these options in the [DevOps Platform Options section of the Configuring Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-scripts.md).

## 7. Add RPC endpoints

If you don't already have an RPC endpoint for each testnet, you'll need to add them to your `foundry.toml` under `[rpc_endpoints]`. You can use private RPC endpoints such as [Ankr](https://www.ankr.com/) or [Chainstack](https://chainstack.com/), or you can use these public RPC endpoints:

```toml
[rpc_endpoints]
goerli = "https://rpc.ankr.com/eth_goerli"
optimism_goerli = "https://goerli.optimism.io"
arbitrum_goerli = "https://goerli-rollup.arbitrum.io/rpc"
bnb_smart_chain_testnet = "https://bsc-testnet.publicnode.com"
gnosis_chiado = "https://rpc.chiadochain.net"
polygon_mumbai = "https://rpc.ankr.com/polygon_mumbai"
```

## 8. Propose the deployment

To propose the deployment, copy and paste the following command, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script:

```
npx sphinx propose <path/to/your-script.s.sol> --testnets
```

Sphinx will propose all transactions that are broadcasted by Foundry.

You can see a full list of the CLI options by running `npx sphinx propose --help`.

Follow the instructions in the terminal to finish the rest of the deployment.
