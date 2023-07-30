# Quick Start with Foundry

This guide will show you how to deploy and test a sample project with Sphinx's Foundry CLI plugin. Once you've finished this guide, the next guide will introduce you to the Sphinx DevOps platform, which extends the CLI tool with additional functionality, such as one-click multi-chain deployments.

> Note: This guide is for setting up Sphinx in a fresh directory. To integrate Sphinx into an existing repository, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-existing-project.md).

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Initialize project](#4-initialize-project)
5. [Test the deployment](#5-test-the-deployment)
6. [Deploy locally](#6-deploy-locally)
7. [Broadcast deployment on Anvil](#7-broadcast-deployment-on-anvil)
8. [Next steps](#8-next-steps)

## 1. Prerequisites

The following must be installed on your machine:
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/) or [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

You must also have a basic understanding of Foundry. See [here](https://book.getfoundry.sh/getting-started/first-steps) for a brief introduction.

## 2. Update Foundry

Make sure you're using the latest version of Foundry.

```
foundryup
```

## 3. Install Sphinx

First, navigate to a fresh directory.

You can install using Yarn or npm.

Yarn:
```
yarn add --dev @sphinx-labs/plugins
```

npm:
```
npm install --save-dev @sphinx-labs/plugins
```

## 4. Initialize project

Next, we'll create a sample project that deploys and tests two contracts. The project is defined in a Sphinx config file, which can be written in either TypeScript or JavaScript.

To use a TypeScript Sphinx config file, run:
```
npx sphinx init --ts --quick-start
```

To use a JavaScript Sphinx config file, run:
```
npx sphinx init --js --quick-start
```

This command created a few files:
- `src/HelloSphinx.sol`: A sample contract to deploy.
- `sphinx/HelloSphinx.config.<ts/js>`: The Sphinx config file, which is where the deployment is defined. This config file will deploy two instances of the `HelloSphinx` contract.
- `test/HelloSphinx.t.sol`: A test file for the deployment.
- `foundry.toml`: The Foundry config file, which contains a few settings that are needed to run Sphinx.
- `.env`: A sample `.env` file that contains a valid private key on Anvil.

## 5. Test the deployment

Run the test file at `test/HelloSphinx.t.sol`:

```
forge test
```

## 6. Deploy locally

With the Sphinx CLI tool, you deploy contracts using a CLI command instead of directly invoking a Forge script.
The CLI command is a thin wrapper over a basic Forge script. When deploying on a standalone network, the deploy command  displays a preview of the deployment and generates deployment artifacts afterwards.

If your Sphinx config file is written in TypeScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.ts
```

If your Sphinx config file is written in JavaScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.js
```

## 7. Broadcast deployment on Anvil

Whenever a deployment is broadcasted, Sphinx will automatically generate deployment artifacts, which
are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

First, load the `.env` file, which contains a valid private key on Anvil:

```
source .env
```

Start an Anvil node:
```
anvil
```

Then, navigate to a new terminal window. We'll broadcast the deployment in this window.

If your Sphinx config file is written in TypeScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --broadcast --private-key $PRIVATE_KEY --rpc http://localhost:8545
```

If your Sphinx config file is written in JavaScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.js --broadcast --private-key $PRIVATE_KEY --rpc http://localhost:8545
```

## 8. Next steps

To get started with the Sphinx DevOps platform, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md).
