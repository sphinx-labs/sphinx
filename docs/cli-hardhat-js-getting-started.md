# Getting Started with Hardhat (JavaScript)

This guide will show you how to deploy and test a sample project with Sphinx's Hardhat CLI plugin. Once you've finished this guide, the next guide will introduce you to the Sphinx DevOps platform, which extends the CLI tool with additional functionality, such as one-click multi-chain deployments.

If your repository has an existing Hardhat project, you can skip to [this step](#5-install-sphinx).

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initialize Node.js](#2-initialize-nodejs)
3. [Install Hardhat](#3-install-hardhat)
4. [Initialize Hardhat](#4-initialize-hardhat)
5. [Install Sphinx](#5-install-sphinx)
6. [Update `hardhat.config.js`](#6-update-hardhatconfigjs)
7. [Initialize Sphinx](#7-initialize-sphinx)
8. [Test the deployment](#8-test-the-deployment)
9. [Deploy on the in-process Hardhat node](#9-deploy-on-the-in-process-hardhat-node)
10. [Deploy on a standalone network](#10-deploy-on-a-standalone-network)
11. [Next steps](#11-next-steps)

## 1. Prerequisites

The following must be installed on your machine:
- [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/) or [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

You must also have a basic understanding of Hardhat. See [here](https://hardhat.org/hardhat-runner/docs/getting-started) for a brief introduction.

## 2. Initialize Node.js

In a new repository, initialize a Node.js project using Yarn or npm.

With Yarn:
```
yarn init -y
```

With npm:
```
npm init -y
```

## 3. Install Hardhat

With Yarn:
```
yarn add --dev hardhat
```

With npm:
```
npm install --save-dev hardhat
```

## 4. Initialize Hardhat

```
npx hardhat
```

## 5. Install Sphinx

With Yarn:
```
yarn add --dev @sphinx/plugins
```
With npm:
```
npm install --save-dev @sphinx/plugins
```

## 6. Update `hardhat.config.js`

You must import `@sphinx/plugins` at the top of your `hardhat.config.js` file:

```js
require('@sphinx/plugins')
```

Next, you must include an `outputSelection` field in the compiler settings of your `hardhat.config.js`. An outline of a Hardhat config is shown for context.

```js
module.exports = {
  ...
  solidity: {
    ...
    compilers: [
      {
        version: ...
        // Copy and paste this:
        settings: {
          outputSelection: {
            '*': {
              '*': ['storageLayout', 'evm.gasEstimates'],
            },
          },
        },
      },
    ]
  }
}
```

## 7. Initialize Sphinx

```
npx hardhat sphinx-init
```

This command created a few new files:
- `contracts/HelloSphinx.sol`: A sample contract to deploy.
- `sphinx/HelloSphinx.config.js`: The Sphinx config file, which is where the deployment is defined. This config file will deploy two instances of the `HelloSphinx` contract.
- `test/HelloSphinx.test.js`: A test file for the deployment.

## 8. Test the deployment

The following command first deploys the Sphinx config file using the first signer on the Hardhat network. Then, it executes the test file.

```
npx hardhat test test/HelloSphinx.test.js --signer 0 --config-path sphinx/HelloSphinx.config.js
```

## 9. Deploy on the in-process Hardhat node

The following command deploys the Sphinx config file using the first signer on the Hardhat network.

```
npx hardhat sphinx-deploy --signer 0 --config-path sphinx/HelloSphinx.config.js
```

## 10. Deploy on a standalone network

Next, we'll spin up a standalone Hardhat network and deploy the Sphinx config on it.

Whenever a deployment occurs on a standalone network, Sphinx will automatically generate deployment artifacts, which
are in the same format as [`hardhat-deploy`](https://github.com/wighawag/hardhat-deploy).

First, start a Hardhat node:
```
npx hardhat node
```

Then, navigate to a new terminal window. We'll deploy the Sphinx config in this window.

The following command deploys the Sphinx config file using the first signer on the Hardhat network.

```
npx hardhat sphinx-deploy --signer 0 --network localhost --config-path sphinx/HelloSphinx.config.js
```

## 11. Next steps

To get started with the Sphinx DevOps platform, click [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-hardhat-getting-started.md).
