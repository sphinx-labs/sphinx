# Quickstart

script = 'script'
test = 'test'
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read", path = "./"}]
allow_paths = ["../.."]
# We recommend setting the optimizer to 'false' for development because
# this makes compilation happen ~5x faster. See here for more details:
# https://book.getfoundry.sh/reference/forge/forge-build?highlight=optimizer#conditional-optimizer-usage
optimizer = false

This guide will show you how to deploy and test a sample project with Sphinx.

> Note: This guide is for setting up Sphinx in a fresh directory. To integrate Sphinx into an existing repository, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-foundry-existing-project.md).

## Table of Contents

TODO(md-end)

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

First, navigate to a fresh directory.

```
mkdir hello_sphinx && cd hello_sphinx
```

Install Sphinx using either Yarn or npm.

Yarn:
```
yarn add --dev @sphinx-labs/plugins
```

npm:
```
npm install --save-dev @sphinx-labs/plugins
```

## 4. Initialize a project

```
npx sphinx init --quickstart
```

This command created a few files:
- `src/HelloSphinx.sol`: A sample contract to deploy.
- `test/HelloSphinx.t.sol`: A test file for the deployment.
- `foundry.toml`: The Foundry config file, which contains a few settings that are needed to run Sphinx. TODO(md): rm?: It also contains public RPC endpoints for several of the networks that Sphinx supports.
- `.env`: A sample `.env` file that contains a valid private key on Anvil.

## 5. Test the deployment

Run the test file at `test/HelloSphinx.t.sol`:

```
forge test
```

## 6. Deploy locally

With the Sphinx CLI tool, you deploy contracts using a CLI command instead of directly invoking a Forge script.
The CLI command is a thin wrapper over a basic Forge script. When deploying on a standalone network, the deploy command  displays a preview of the deployment and generates deployment artifacts afterwards.

## 7. Broadcast deployment on Anvil

TODO(md): show both ways (`forge script` and `sphinx deploy`)

Whenever a deployment is broadcasted, Sphinx will automatically generate deployment artifacts, which
are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

First, start an Anvil node:
```
anvil
```

Then, navigate to a new terminal window.

In the new terminal window, load the `.env` file, which contains a valid private key on Anvil:

```
source .env
```

If your Sphinx config file is written in TypeScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --broadcast --private-key $PRIVATE_KEY --rpc http://127.0.0.1:8545
```

If your Sphinx config file is written in JavaScript:

```
npx sphinx deploy --config sphinx/HelloSphinx.config.js --broadcast --private-key $PRIVATE_KEY --rpc http://127.0.0.1:8545
```

## 8. Next steps

To get started with the Sphinx DevOps platform, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md).
