# Getting Started with the Sphinx DevOps Platform

This guide will walk you through a sample multi-chain deployment using the Sphinx Foundry plugin and DevOps platform.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [High-level overview](#2-high-level-overview)
3. [Get testnet ETH on OP Goerli](#3-get-testnet-eth-on-op-goerli)
4. [Get your credentials](#4-get-your-credentials)
5. [Set environment variables](#5-set-environment-variables)
6. [Configure your script](#6-configure-your-script)
7. [Add RPC endpoints](#7-add-rpc-endpoints)
8. [Propose the deployment](#8-propose-the-deployment)
9. [Learn more](#9-learn-more)

## 1. Prerequisites

You'll need an EOA that exists on live networks.

Also, make sure that you've already completed one of the following guides:

* [Quickstart with Foundry](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md)
* [Integrate Sphinx into an Existing Foundry Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md)

## 2. High-level overview

To give some context on the deployment process, here's a high-level overview of how it works.

Deployments are a three-step process with the DevOps platform.

1. **Proposal**: The deployment is proposed on the command line or in a CI process. This creates a meta transaction that's signed by the proposer then relayed to Sphinx's back-end. For simplicity, we'll propose the deployment on the command line in this guide.
2. **Approval**: The project owner(s) sign a meta transaction to approve the deployment in the Sphinx UI.
3. **Execution**: The deployment is executed on-chain by a relayer. In order to execute the deployment, the relayer must submit **both** the meta transaction signed by the proposer and the owners.

> Note: Although it's not strictly necessary to have both a proposal and approval step, we include both to improve the security of the deployment process. Having both steps prevents a scenario where one of the steps is a single point of failure. In other words, if a proposer's private key is leaked, an attacker would also need to trick the project owners into approving a malicious deployment. Likewise, if the project owners are tricked into approving a malicious deployment in a phishing attack on the Sphinx UI, the attacker would also need access to the proposer's private key, since its signature is also required to execute the deployment.

## 3. Get testnet ETH on OP Goerli

You'll need a small amount of testnet ETH on Optimism Goerli, which you can get at [their faucet](https://app.optimism.io/faucet). Later, you'll use this ETH to deploy a `SphinxBalance` contract. You'll pay for the cost of your deployments by depositing USDC into this contract before it's executed. On testnets, we only allow you to fund deployments in USDC on Optimism Goerli. Likewise, on production networks, we only allow you to fund deployments in USDC on Optimism Mainnet. We'll provide you with free USDC on Optimism Goerli to fund your deployments on testnets.

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

Open the Sphinx script you'd like to deploy.

In your `setUp` function, update the `owners` array to include the address of your EOA.

Then, copy and paste the following config options into your `setUp` function:
```
sphinxConfig.orgId = <org ID>;
sphinxConfig.proposers = [<your address>];
sphinxConfig.mainnets = [];
sphinxConfig.testnets = [
  Network.goerli,
  Network.optimism_goerli,
  Network.arbitrum_goerli,
  Network.polygon_mumbai,
  Network.bnbt,
  Network.gnosis_chiado
];
```

We'll describe these fields briefly here:
- `orgId` (`string`): Your organization ID from the Sphinx UI. This is a public field, so you don't need to keep it secret.
- `proposers` (`address[]`): An array of proposer addresses. We recommend that you use a dedicated EOA for your proposer that does not store any funds and is not used for any other purpose aside from proposing.
- `mainnets`: (`Network[]`): The list of production networks to deploy on. See the [full list of supported production networks](https://github.com/sphinx-labs/sphinx/blob/develop/docs/supported-networks.md#production-networks).
- `testnets`: (`Network[]`): The list of testnets to deploy on. See the [full list of supported test networks](https://github.com/sphinx-labs/sphinx/blob/develop/docs/supported-networks.md#test-networks).

Fill in these fields with your values. You can leave the `mainnets` array empty because we'll only be deploying on testnets in this guide.

## 7. Add RPC endpoints

If you don't already have an RPC endpoint for each testnet, you'll need to add them to your `foundry.toml` under `[rpc_endpoints]`. You can either use private RPC endpoints such as [Ankr](https://www.ankr.com/) or [Chainstack](https://chainstack.com/), or you can use these public RPC endpoints:

TODO(md): replace the alchemy nodes. they're down rn.

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

For simplicity, we'll propose the deployment on the command line in this guide. However, we recommend that you propose deployments in a CI process for production deployments.

Propose the deployment:

```
npx sphinx propose ./path/to/Script.s.sol --testnets
```

Follow the instructions in the terminal to complete the deployment.

## 9. Learn more

We recommend deploying from a CI process in production. See [this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md) to setup proposals in CI.
