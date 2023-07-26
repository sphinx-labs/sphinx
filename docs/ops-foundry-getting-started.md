# Getting Started with the DevOps Platform

This guide will walk you through a sample multi-chain deployment using the Sphinx Foundry plugin and DevOps platform.

## Table of Contents

1. [High-level overview](#1-high-level-overview)
2. [Prerequisites](#2-prerequisites)
3. [Get your credentials](#3-get-your-credentials)
4. [Update your Sphinx config file](#4-update-your-sphinx-config-file)
5. [Propose the deployment](#5-propose-the-deployment)
6. [Approve the deployment](#6-approve-the-deployment)

## 1. High-level overview

To give some context on the deployment process, here's a high-level overview of how it works.

Deployments are a three-step process with the DevOps platform.

1. **Proposal**: The deployment is proposed on the command line. This creates a meta transaction that's signed by the proposer then relayed to Sphinx's back-end.
2. **Approval**: The deployment is approved by the owners in the Sphinx UI. Each owner signs using a meta transaction.
3. **Execution**: The deployment is trustlessly executed on-chain by a relayer. In order to execute the deployment, the relayer must submit the meta transactions signed by the proposer and the owners.

## 2. Prerequisites

You'll need an EOA that exists on live networks. It doesn't need to be funded.

Also, make sure that you've already completed one of the following guides:

* [Quick Start with Foundry](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quick-start.md)
* [Integrate Sphinx into an Existing Foundry Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-existing-project.md)

## 3. Get your credentials

First, you'll need a Sphinx API key and an organization ID. You can get these in the Sphinx DevOps platform [here](TODO).

## 4. Update your Sphinx config file

Navigate to the repository where you completed the Foundry getting started guide.

Enter your Sphinx API key in your `.env` file:
```
SPHINX_API_KEY=<your Sphinx API key>
```

Then, open a Sphinx config file, which is in the `sphinx/` folder. We'll extend this config file to support
multi-chain deployments.

We'll add an `options` field to the config file, which contains the settings of your project. Copy and paste the `options` field below into your config file:

```ts
{
  options: {
    orgId: <your org ID>,
    owners: [<your address>],
    proposers: [<your address>],
    testnets: ['goerli', 'optimism-goerli', 'arbitrum-goerli', 'maticmum', 'bnbt', 'gnosis-chiado'],
    mainnets: [],
    threshold: 1,
  },

  // The rest of the config file goes here:
  projectName: ...,
  contracts: ...,
}
```

Fill in the `orgId` field with your organization ID from the Sphinx UI. Also, enter your address in the `owners` and `proposers` fields.

If you'd like to learn more about these fields, check out the [Sphinx config file reference](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md).

## 5. Propose the deployment

```
npx sphinx propose --testnets --config <path_to_sphinx_config>
```

## 6. Approve the deployment

TODO
