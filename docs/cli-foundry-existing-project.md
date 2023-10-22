# Integrate Sphinx into an Existing Foundry Project

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. We'll create a sample project to demonstrate how to deploy and test contracts using Sphinx.

Once you've finished this guide, the next guide will give you more details on how you can write your own deployment scripts using Sphinx.

> If you're looking to setup Sphinx in a fresh directory, go to the [Quickstart guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-quickstart.md).

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Update `gitignore`](#4-update-gitignore)
5. [Update `forge-std`](#5-update-forge-std)
6. [Update `foundry.toml`](#6-update-foundrytoml)
7. [Add remappings](#7-add-remappings)
8. [Initialize a project](#8-initialize-a-project)
9. [Test the deployment](#9-test-the-deployment)
10. [Broadcast deployment on Anvil (optional)](#11-broadcast-deployment-on-anvil-optional)
11. [Learn more](#12-learn-more)

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
client/
```

TODO(md): where do we add `client/` to the gitignore in the quickstart?

TODO(md): is step 5 necessary anymore? if not, remove it.

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
fs_permissions = [{ access = "read-write", path = "./"}]
```

TODO(md): move this to the section on broadcasting to anvil?

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

## 8. Initialize a project

Next, we'll create a sample project using the command:
```
npx sphinx init
```

This created a few files:
- `HelloSphinx.sol`: A sample contract to deploy. This is located in your contract folder, which defaults to `src/` if one doesn't already exist.
- `HelloSphinx.s.sol`: A Sphinx deployment script. This script is located in your existing script folder or `script/` if one doesn't exist. It will deploy a `HelloSphinx` contract then call a function on it.
- `HelloSphinx.t.sol`: A test file for the deployment. This is located in your existing test folder, or `test/` if one doesn't exist.

## 9. Generate the Sphinx clients

The main difference between Sphinx deployment scripts and vanilla Forge scripts is that you deploy and interact with your contracts using autogenerated clients. Sphinx uses clients to ensure that your deployment process is idempotent, which means that each transaction in your deployment will be executed exactly once, even if you run the script multiple times.

Generate the clients with the command:

```
npx sphinx generate
```

## 9. Test the deployment

Run the test in `HelloSphinx.t.sol`:
```
forge test --match-contract HelloSphinxTest
```

## 10. Broadcast deployment on Anvil (optional)

Start an Anvil node:
```
anvil
```

TODO(md): in any of our code examples, do we use the constructor in any scripts? if so, we should change that to be setUp.

TODO(md): where do we talk about the limitations of clients? e.g. you can't define them using view functions

Add a private key to your .env file. We'll use the first valid one on Anvil:
```
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Then, navigate to a new terminal window. Deploy using the `deploy` command:

```
npx sphinx deploy ./solidity/scripts/HelloSphinx.s.sol --network anvil
```

You'll be shown a preview of your deployment and prompted to confirm. Whenever a deployment is broadcasted, Sphinx will automatically generate deployment artifacts, which are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

Once the deployment completes, you'll find the deployment artifacts written to `./deployments/anvil-31337.json`.

## 11. Learn more

Learn more about writing deployment scripts with Sphinx in [this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md).
