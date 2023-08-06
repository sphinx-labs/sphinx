# Integrate Sphinx into an Existing Foundry Project

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. We'll also create a sample project to demonstrate how to test contracts using Sphinx.

Once you've finished this guide, the next guide will introduce you to the Sphinx DevOps platform, which extends the CLI tool with additional functionality, such as one-click multi-chain deployments.

> Note: If you're looking to setup Sphinx in a fresh directory, go to the [Quickstart guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quickstart.md).

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Update `gitignore`](#4-update-gitignore)
5. TODO
6. [Update `foundry.toml`](#6-update-foundrytoml)
7. [Add remappings](#7-add-remappings)
8. [Initialize a project](#8-initialize-a-project)
9. [Test the deployment](#9-test-the-deployment)
10. [Deploy locally (optional)](#10-deploy-locally-optional)
11. [Broadcast deployment on Anvil (optional)](#11-broadcast-deployment-on-anvil-optional)
12. [Learn more](#12-learn-more)

## 1. Prerequisites

The following must be installed on your machine:
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/) or [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

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
yarn add --dev @sphinx-labs/plugins
```

npm:
```
npm install --save-dev @sphinx-labs/plugins
```

## 4. Update `gitignore`

Add the following to your `.gitignore` file:
```
node_modules/
```

## 5. Update `forge-std`

You must update your `forge-std` dependency to version `1.6.0` or higher. A few options are listed below depending on how `forge-std` is installed in your repository.

### If you've installed `forge-std` using Foundry's default installation method (git submodules):

You can update to the latest version of `forge-std` by running the command:

```
forge install foundry-rs/forge-std
```

### If you've installed `forge-std` using Yarn or npm:

You can skip this step if the `forge-std` dependency in your `package.json` has a version of `1.6.0` or higher.

Otherwise, you can update `forge-std` to version `1.6.0` by running one of the following commands.

> Note: If `forge-std` is installed under `devDependencies` in your `package.json`, make sure you add the `--dev` flag for Yarn, or the `--save-dev` flag for npm.

Yarn:
```
yarn add https://github.com/foundry-rs/forge-std.git#v1.6.0
```

npm:
```
npm install https://github.com/foundry-rs/forge-std.git#v1.6.0
```

### If you haven't installed `forge-std` yet:

You can install it with the command:

```
forge install foundry-rs/forge-std
```

## 6. Update `foundry.toml`

Update your `foundry.toml` file to include a few settings that are needed to run Sphinx. We recommend putting them under `[profile.default]`.

```
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read", path = "./"}]
```

Then, add Anvil to your `rpc_endpoints`:
```
[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
```

## 7. Add remappings

You probably already have remappings either in your `foundry.toml` or `remappings.txt` file. If you don't, we recommend adding a `remappings.txt` file in the root of your repository.

If you're using a `remappings.txt` file, add:
```
@sphinx-labs/plugins=node_modules/@sphinx-labs/plugins/contracts/foundry/
@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/
```

If your remappings are in `foundry.toml`, update your `remappings` array to include:
```
remappings=[
  '@sphinx-labs/plugins=node_modules/@sphinx-labs/plugins/contracts/foundry',
  '@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/'
]
```

## 8. Initialize a project

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

## 9. Test the deployment

Run the test in `HelloSphinx.t.sol`:
```
forge test --match-contract HelloSphinxTest
```

## 10. Deploy locally (optional)

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

## 11. Broadcast deployment on Anvil (optional)

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
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --broadcast --rpc http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

If your Sphinx config file is written in JavaScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.js --broadcast --rpc http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## 12. Learn more

To get started with the Sphinx DevOps platform, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md).
