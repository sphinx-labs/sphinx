# Getting Started in an Existing Repository

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. We'll create a sample project, then test and deploy it locally.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Update `gitignore`](#4-update-gitignore)
5. [Update `foundry.toml`](#5-update-foundrytoml)
6. [Add remappings](#6-add-remappings)
7. [Initialize a project](#7-initialize-a-project)
8. [Generate clients](#8-generate-clients)
9. [Update your build command (optional)](#9-update-your-build-command-optional)
10. [Test the deployment](#10-test-the-deployment)
11. [Broadcast a deployment on Anvil (optional)](#11-broadcast-a-deployment-on-anvil-optional)
12. [Next steps](#12-next-steps)

## 1. Prerequisites

The following must be installed on your machine:
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/), [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or [pnpm](https://pnpm.io/installation)

You must also have a basic understanding of how to use Foundry and Forge scripts. Here are the relevant guides in the Foundry docs:
* [Getting Started with Foundry](https://book.getfoundry.sh/getting-started/first-steps)
* [Writing Deployment Scripts with Foundry](https://book.getfoundry.sh/tutorials/solidity-scripting)

## 2. Update Foundry

Make sure you're using the latest version of Foundry.

```
foundryup
```

## 3. Install Sphinx

First, navigate to the root of your repository.

Then, install Sphinx using your preferred package manager.

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

## 4. Update `.gitignore`

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
  '@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/',
  'sphinx-forge-std/=node_modules/sphinx-forge-std/src/',
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

## 8. Generate clients

Sphinx currently only supports CREATE3 deployments.

To improve the UX of CREATE3 deployments, Sphinx autogenerates **clients**, which are thin wrappers over your contracts that provide type safety for your constructor arguments. You'll need to use clients when deploying your contracts.

```
npx sphinx generate
```

This command writes the clients into a new `client` folder.

If you change the interface of one of your contract's constructors, you'll also need to re-run the `generate` command.

## 9. Update your build command (optional)

Follow this step if you use a build command to compile your contracts (e.g. `yarn build`). Otherwise, skip to the next step.

You'll need to generate the Sphinx clients in your build command, or else the compilation process will fail.

Open your `package.json`, then navigate to the `"build"` field, which is located in the following location:
```json
{
  "scripts": {
    "build": ...
  }
}
```

Then, copy and paste `npx sphinx generate` into your build command. You can use this as a drop-in replacement for `forge build`, since it runs this command under the hood.

## 10. Test the deployment

Run the test in `HelloSphinx.t.sol`:
```
forge test --match-contract HelloSphinxTest
```

## 11. Broadcast a deployment on Anvil (optional)

Sphinx has its own CLI task for broadcasting deployments onto stand-alone networks. This is useful when you'd rather deploy using a funded private key from your local machine. For example, you may use this command to deploy your contracts onto Anvil when integrating your contracts with your front-end.

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
npx sphinx deploy ./script/HelloSphinx.s.sol --network anvil
```

You'll be shown a preview of your deployment and prompted to confirm. Any transactions that are broadcasted by Foundry will be included in the deployment.

Once the deployment completes, you'll find the deployment artifacts written to `./deployments/anvil-31337.json`. Whenever a deployment is broadcasted, Sphinx will automatically generate deployment artifacts, which are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

When deploying on a live network, you can verify your contracts using the `--verify` flag.

## 12. Next steps

Your next step is to follow the [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-getting-started.md) guide.
