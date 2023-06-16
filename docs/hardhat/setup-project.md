# Setting up a ChugSplash project

This guide will show you how to setup a project with the ChugSplash Hardhat plugin.

If your repository has an existing Hardhat project, you can skip to [here](#install-chugsplash).

## Table of Contents

- [Initialize Node.js](#initialize-nodejs)
- [Install Hardhat](#install-hardhat)
- [Initialize Hardhat](#initialize-hardhat)
- [Install ChugSplash](#install-chugsplash)
- Setup ChugSplash:
  - [In a JavaScript Project](#setup-chugsplash-using-javascript)
  - [In a TypeScript Project](#setup-chugsplash-using-typescript)
- [Learn More](#learn-more)

## Initialize Node.js

If you are in a new repository, initialize a Node.js project using [yarn](https://classic.yarnpkg.com/lang/en/) or [npm](https://docs.npmjs.com/cli/v8/). Otherwise, skip to the next step.

With Yarn:
```
yarn init -y
```

With npm:
```
npm init -y
```

## Install Hardhat

Install Hardhat in your repository if it isn't already installed.

With Yarn:
```
yarn add --dev hardhat
```

With npm:
```
npm install --save-dev hardhat
```

## Initialize Hardhat

```
npx hardhat
```

## Install ChugSplash

With Yarn:
```
yarn add --dev @chugsplash/plugins
```
With npm:
```
npm install --save-dev @chugsplash/plugins
```

## Setup ChugSplash using TypeScript

If you have a TypeScript Hardhat project, follow these instructions. Otherwise, go to [the JavaScript instructions](#setup-chugsplash-using-javascript) instead.

To setup ChugSplash, you **must** update `hardhat.config.ts` to include the following:

```ts
... // Other plugin imports go here

import '@chugsplash/plugins'

const config: HardhatUserConfig = {
  ... // Other Hardhat settings go here
  solidity: {
    ... // Other Solidity settings go here
    compilers: [
      {
        version: ... , // Solidity compiler version (e.g. 0.8.15)
        settings: {
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
      // Other compiler config objects go here (optional)
    ]
  }
}

export default config
```

Next, create a sample ChugSplash project:
```
npx hardhat chugsplash-init
```

This command created a `chugsplash/` folder, which is will contain your deployments.

It also created a few files:
* `chugsplash/hello-chugsplash.ts`: The ChugSplash config file where your first deployment is defined.
* `contracts/HelloChugSplash.sol`: The smart contract that will be deployed.
* `test/HelloChugSplash.spec.ts`: The test file for your deployment.

To deploy `HelloChugSplash.sol` locally:
```
npx hardhat chugsplash-deploy --config-path chugsplash/hello-chugsplash.ts
```

To test your deployment:
```
npx hardhat test test/HelloChugSplash.spec.ts
```

## Update your Organization Id
Before deploying on a live network, you'll want to update the organization id in your ChugSplash config file. The organization id must be unique to you. If you are using ChugSplash managed, then we will provide one for you and
you should just copy paste it into your config. If you are not using ChugSplash managed, then you will have to
generate a unique organization id yourself. It must be a 32 byte hex string. You can easily generate one using ethers
like so:
```
organizationID: ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('random-string')
),
```

## Setup ChugSplash using JavaScript

If you have a JavaScript Hardhat project, follow these instructions. Otherwise, go to [the TypeScript instructions](#setup-chugsplash-using-typescript) instead.

To setup ChugSplash, you **must** update `hardhat.config.js` to include the following:

```js
... // Other plugin imports go here

require('@chugsplash/plugins')

module.exports = {
  ... // Other Hardhat settings go here
  solidity: {
    ... // Other Solidity settings go here
    compilers: [
      {
        version: ... , // Solidity compiler version (e.g. 0.8.15)
        settings: {
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
      // Other compiler config objects go here (optional)
    ]
  }
}
```

Next, create a sample ChugSplash project:
```
npx hardhat chugsplash-init
```

This command created a `chugsplash/` folder, which is will contain your deployments.

It also created a few files:
* `chugsplash/hello-chugsplash.js`: The ChugSplash config file where your first deployment is defined.
* `contracts/HelloChugSplash.sol`: The smart contract that will be deployed.
* `test/HelloChugSplash.test.js`: The test file for your deployment.

To deploy `HelloChugSplash.sol` locally:
```
npx hardhat chugsplash-deploy --config-path chugsplash/hello-chugsplash.js
```

To test your deployment:
```
npx hardhat test test/HelloChugSplash.test.js
```

## Learn More

Once you've set up a ChugSplash project, the next step is to learn about the [ChugSplash
file](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md), which is where
you define deployments and upgrades.
