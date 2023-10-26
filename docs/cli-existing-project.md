# Integrate Sphinx into an Existing Foundry Project

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. We'll create a sample project to show you how to deploy and test contracts using Sphinx.

> If you're looking to setup Sphinx in a fresh directory, use the [Quickstart guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md) instead.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Update `gitignore`](#4-update-gitignore)
5. [Update `foundry.toml`](#5-update-foundrytoml)
6. [Add remappings](#6-add-remappings)
7. [Initialize a project](#7-initialize-a-project)
8. [Generate Sphinx Clients](#8-generate-the-sphinx-clients)
9. [Test the deployment](#9-test-the-deployment)
10. [Broadcast deployment on Anvil (optional)](#10-broadcast-deployment-on-anvil-optional)
11. [Learn more](#11-learn-more)

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

You can install Sphinx using Yarn, npm, or pnpm.

Yarn:
```
yarn add --dev @sphinx-labs/plugins
```

npm:
```
npm install --save-dev @sphinx-labs/plugins
```

pnpm:
```
pnpm add -D @sphinx-labs/plugins
```

## 4. Update `gitignore`

Add the following to your `.gitignore` file:
```
node_modules/
client/
```

## 5. Update `foundry.toml`

Update your `foundry.toml` file to include a few settings that are needed to run Sphinx. We recommend putting them under `[profile.default]`.

```
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read-write", path = "./"}]
```

We also highly recommend setting `optimizer = 'false'` for development because this makes compilation happen ~5x faster. See the [Foundry docs](https://book.getfoundry.sh/reference/forge/forge-build?highlight=optimizer#conditional-optimizer-usage) for more details.

## 6. Add remappings

You probably already have remappings either in your `foundry.toml` or `remappings.txt` file. If you don't, we recommend adding a `remappings.txt` file in the root of your repository.

If you're using a `remappings.txt` file, add:
```
@sphinx-labs/plugins=node_modules/@sphinx-labs/plugins/contracts/foundry/
@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/
sphinx-forge-std/=node_modules/sphinx-forge-std/src/
sphinx-solmate/=node_modules/sphinx-solmate/src/
```

If your remappings are in `foundry.toml`, update your `remappings` array to include:
```
remappings=[
  '@sphinx-labs/plugins=node_modules/@sphinx-labs/plugins/contracts/foundry',
  '@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/'
  'sphinx-forge-std/=node_modules/sphinx-forge-std/src/'
  'sphinx-solmate/=node_modules/sphinx-solmate/src/'
]
```

## 7. Initialize a project

Next, we'll create a sample project using the command:
```
npx sphinx init
```

This created a few files:
- `HelloSphinx.sol`: A sample contract to deploy. This is located in your contract folder, which defaults to `src/` if one doesn't already exist.
- `HelloSphinx.s.sol`: A Sphinx deployment script. This script is located in your existing script folder or `script/` if one doesn't exist. It will deploy a `HelloSphinx` contract then call a function on it.
- `HelloSphinx.t.sol`: A test file for the deployment. This is located in your existing test folder, or `test/` if one doesn't exist.

## 8. Generate the Sphinx clients
To improve the UX of CREATE3 deployments, Sphinx autogenerates **clients**, which are thin wrappers over your contracts that provide type safety for your constructor arguments. You'll need to use clients when deploying your contracts.

```
npx sphinx generate
```

## 9. Test the deployment

Run the test in `HelloSphinx.t.sol`:
```
forge test --match-contract HelloSphinxTest
```

## 10. Broadcast deployment on Anvil (optional)

First, add Anvil to your `rpc_endpoints` in your `foundry.toml`:
```
[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
```

Start an Anvil node:
```
anvil
```

Add a private key to your .env file. We'll use the first valid one on Anvil:
```
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Then, navigate to a new terminal window. Broadcast the deployment with the following command. You may need to change the path to the script depending on the location of your script directory.

```
npx sphinx deploy ./scripts/HelloSphinx.s.sol --network anvil
```

When deploying on a live network, you can verify your contracts using the `--verify` flag.

You'll be shown a preview of your deployment and prompted to confirm.

Once the deployment completes, you'll find the deployment artifacts written to `./deployments/anvil-31337.json`. Whenever a deployment is broadcasted, Sphinx will automatically generate deployment artifacts, which are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

## 11. Learn more

Learn more about writing deployment scripts with Sphinx in [this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md).
