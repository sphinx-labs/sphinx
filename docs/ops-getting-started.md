# Getting Started with the Sphinx DevOps Platform

This guide will walk you through a sample multi-chain deployment using the Sphinx Foundry plugin and DevOps platform.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [High-level overview](#2-high-level-overview)
3. [Get testnet ETH on OP Goerli](#3-get-testnet-eth-on-op-goerli)
4. [Get your credentials](#4-get-your-credentials)
5. [Update your Sphinx config options](#5-update-your-sphinx-script-config-options)
6. [Configure your Proposer](#6-configure-your-proposer)
7. [Add RPC endpoints](#7-add-rpc-endpoints)
8. [Propose the deployment](#8-propose-the-deployment)
9. [Learn more](#12-learn-more)

## 1. Prerequisites

You'll need an EOA that exists on live networks.

Also, make sure that you've already completed one of the following guides:

* [Quickstart with Foundry](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md)
* [Integrate Sphinx into an Existing Foundry Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md)

## 2. High-level overview

To give some context on the deployment process, here's a high-level overview of how it works.

Deployments are a three-step process with the DevOps platform.

TODO(md): c/f and remove 'trustless'.

1. **Proposal**: The deployment is proposed on the command line or in a CI process. This creates a meta transaction that's signed by the proposer then relayed to Sphinx's back-end. For simplicity, we'll propose the deployment on the command line in this guide.
2. **Approval**: The project owner(s) sign a meta transaction to approve the deployment in the Sphinx UI.
3. **Execution**: The deployment is trustlessly executed on-chain by a relayer. In order to execute the deployment, the relayer must submit the meta transactions signed by the proposer and the owners.

## 3. Get testnet ETH on OP Goerli

You'll need a small amount of testnet ETH on Optimism Goerli, which you can get at [their faucet](https://app.optimism.io/faucet). Later, you'll use this ETH to deploy a `SphinxBalance` contract. You'll pay for the cost of your deployments by depositing USDC into this contract before it's executed. On testnets, we  only allow you to fund deployments in USDC on Optimism Goerli. Likewise, on production networks, we only allow you to fund deployments in USDC on Optimism Mainnet. We'll provide you with free USDC on Optimism Goerli to fund your deployments on testnets.

## 4. Get your credentials

You'll need a Sphinx API key and an organization ID. You can get these in the [Sphinx DevOps platform](https://www.sphinx.dev/).

## 5. Update your Sphinx Script Config Options

Navigate to the repository where you completed the Foundry getting started guide.

Enter your Sphinx API key in your `.env` file:
```
SPHINX_API_KEY=<your API key>
```

Then, open your Sphinx deployment script. We're going to add some additional options to support a multi-chain deployment on several testnets.

Copy and paste the following options into your script's `setUp` function:
```
sphinxConfig.orgId = "<your org id>";
sphinxConfig.testnets = [
  Network.goerli,
  Network.optimism_goerli,
  Network.arbitrum_goerli,
  Network.polygon_mumbai,
  Network.bnbt,
  Network.gnosis_chiado
];
```

Fill in the `orgId` field with your organization ID from the Sphinx UI. The `orgId` is a public field, so you don't need to keep it secret.

You should also update the `sphinxConfig.owners` array to contain an EOA that exists on live networks.

## 6. Configure Your Proposer

Sphinx includes a proposal step to make the deployment process more secure. The proposal occurs either on your local machine or in your CI process. In the proposal,  It signs a hash of your deployment with its private key. This signature is required for the deployment to be executed on chain in addition to the signature of your owner account. This signature prevents your deployment from being tampered with prior to you approving it via the UI.

The proposer can be any EOA, but we recommend generating a fresh account that does not store any funds.  using the wallet of your choice.

Once you've created the proposer, add it to your Sphinx configuration underneath the rest of your options:
```
sphinxConfig.proposers = [<your proposer address>];
```

Then add your proposer private key to your .env file:
```
PROPOSER_PRIVATE_KEY=<proposer private key>
```

## 7. Add RPC endpoints

If you don't already have an RPC endpoint for each testnet, you'll need to add them to your `foundry.toml` under `[rpc_endpoints]`. You can either use private RPC endpoints such as [Ankr](https://www.ankr.com/) or [Chainstack](https://chainstack.com/), or you can use these public RPC endpoints:

```toml
[rpc_endpoints]
goerli = "https://eth-goerli.g.alchemy.com/v2/demo"
optimism_goerli = "https://opt-goerli.g.alchemy.com/v2/demo"
arbitrum_goerli = "https://arb-goerli.g.alchemy.com/v2/demo"
bnb_smart_chain_testnet = "https://bsc-testnet.publicnode.com"
gnosis_chiado = "https://rpc.chiadochain.net"
polygon_mumbai = "https://polygon-mumbai.g.alchemy.com/v2/demo"
```

## 8. Propose the deployment

For simplicity, we'll propose the deployment on the command line in this guide. However, we recommend that you propose deployments in a CI process for production deployments. [Check out the CI integration guide for.](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md)

Propose the deployment:

```
npx sphinx propose ./path/to/Script.s.sol --testnets
```

Follow the instructions in the terminal to complete the deployment.

## 9. Learn more

[Setup Deployments in CI with Sphinx](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md)
