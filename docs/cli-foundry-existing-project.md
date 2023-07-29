# Integrate Sphinx into an Existing Foundry Project

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. Once you've finished this guide, the next guide will introduce you to the Sphinx DevOps platform, which extends the CLI tool with additional functionality, such as one-click multi-chain deployments.

> Note: If you're looking to setup Sphinx in a fresh directory, go to the [Quick Start guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quick-start.md).

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Update `forge-std`](#4-update-forge-std)
5. [Update `foundry.toml`](#5-update-foundrytoml)
6. [Initialize project](#6-initialize-project)
7. [Test the deployment](#7-test-the-deployment)
8. [Deploy locally](#8-deploy-locally)
9. [Broadcast deployment on Anvil](#9-broadcast-deployment-on-anvil)
10. [Learn more](#10-learn-more)

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

First, navigate to the root of your repository.

You can install Sphinx using Yarn or npm.

Yarn:
```
yarn add --dev @sphinx/plugins
```

npm:
```
npm install --save-dev @sphinx/plugins
```

## 4. Update `forge-std`

You must update your `forge-std` package to the latest version.

You can use `forge update` to update it. For example, if `forge-std` is in a `lib/` folder, you can run the command:

```
forge update lib/forge-std
```

## 5. Update `foundry.toml`

Next, we'll need to update the `foundry.toml` file to include a few settings that are needed to run Sphinx. We recommend putting them under `[profile.default]`.

```
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read", path = "./"}]
```

Next, we'll need to add a couple remappings. You probably already have remappings either in your `foundry.toml` or `remappings.txt` file. If you don't, we recommend adding a `remappings.txt` file in the root of your repository.

If you're using a `remappings.txt` file, add:
```
@sphinx/plugins=node_modules/@sphinx/plugins/contracts/foundry/
@sphinx/contracts=node_modules/@sphinx/contracts/
```

If your remappings are in `foundry.toml`, update your `remappings` array to include:
```
remappings=[
  '@sphinx/plugins=node_modules/@sphinx/plugins/contracts/foundry',
  '@sphinx/contracts=node_modules/@sphinx/contracts/'
]
```

## 6. Initialize project

Next, we'll create a sample project that deploys and tests two contracts. The project is defined in a Sphinx config file, which can be written in either TypeScript or JavaScript.

To use a TypeScript Sphinx config file, run:
```
npx sphinx init --ts
```

To use a JavaScript Sphinx config file, run:
```
npx sphinx init --js
```

This command created a few files:
- `HelloSphinx.sol`: A sample contract to deploy. This is located in your contract folder, or `src/` if one doesn't exist.
- `sphinx/HelloSphinx.config.<ts/js>`: The Sphinx config file, which is where the deployment is defined. This config file will deploy two instances of the `HelloSphinx` contract.
- `HelloSphinx.t.sol`: A test file for the deployment. This is located in your existing test folder, or `test/` if one doesn't exist.

## 7. Test the deployment

Run the test in `HelloSphinx.t.sol`:
```
forge test --match-contract HelloSphinxTest
```

## 8. Deploy locally

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

## 9. Broadcast deployment on Anvil

Next, we'll broadcast a deployment on Anvil using the first valid private key on this network.

Whenever a deployment is broadcasted, Sphinx will automatically generate deployment artifacts, which
are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

Start an Anvil node:
```
anvil
```

Then, navigate to a new terminal window. We'll broadcast the deployment in this window.

If your Sphinx config file is written in TypeScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --broadcast --rpc http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

If your Sphinx config file is written in JavaScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.js --broadcast --rpc http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## 10. Learn more

To get started with the Sphinx DevOps platform, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md).
