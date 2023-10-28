# Getting Started in an Existing Repository

TODO(md-end): header numbers are out of order

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. We'll create a sample project, then test and deploy it locally.

## Table of Contents

TODO(md-end)

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
'@sphinx-labs/plugins=node_modules/@sphinx-labs/plugins/contracts/foundry',
'@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/'
'sphinx-forge-std/=node_modules/sphinx-forge-std/src/'
'sphinx-solmate/=node_modules/sphinx-solmate/src/'
```

## 7. Initialize a project

Next, we'll create a sample project using the command:
```
npx sphinx init
```

This created a few files:
- `HelloSphinx.sol`: A sample contract to deploy. This file is written to your existing contract folder, which defaults to `src/`.
- `HelloSphinx.s.sol`: A sample deployment script. This file is written to your existing script folder, which defaults to `script/`.
- `HelloSphinx.t.sol`: A sample test file. This file is written to your existing test folder, which defaults to `test/`.

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

Then, navigate to a new terminal window. Broadcast the deployment with the following command, replacing `<path/to/your-script.s.sol>` with the path to your deployment script.

```
npx sphinx deploy <path/to/your-script.s.sol> --network anvil
```

You'll be shown a preview of your deployment and prompted to confirm. Any transactions that are broadcasted by Foundry will be included in the deployment.

Whenever a deployment is broadcasted with this command, Sphinx will automatically generate deployment artifacts, which are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy). When the deployment completes, you'll find the deployment artifacts written to `./deployments/anvil-31337.json`.

If you'd like to use this command to deploy on a live network, you can verify your contracts on block explorers using the `--verify` flag.

## 12. Next steps

If you'd like to try out the DevOps platform, see the [Sphinx DevOps Platform guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-getting-started.md).

If you'd like to learn more about writing deployment scripts with Sphinx, see the [Writing Deployment Scripts with Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-scripts.md).
