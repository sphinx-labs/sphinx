# Setting up a Sphinx project

This guide will show you how to setup a project with the Sphinx Hardhat plugin.

If your repository has an existing Hardhat project, you can skip to [here](#install-sphinx).

## Table of Contents

- [Initialize Node.js](#initialize-nodejs)
- [Install Hardhat](#install-hardhat)
- [Initialize Hardhat](#initialize-hardhat)
- [Install Sphinx](#install-sphinx)
- Setup Sphinx:
  - [In a JavaScript Project](#setup-sphinx-using-javascript)
  - [In a TypeScript Project](#setup-sphinx-using-typescript)
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

## Install Sphinx

With Yarn:
```
yarn add --dev @sphinx/plugins
```
With npm:
```
npm install --save-dev @sphinx/plugins
```

## Setup Sphinx using TypeScript

If you have a TypeScript Hardhat project, follow these instructions. Otherwise, go to [the JavaScript instructions](#setup-sphinx-using-javascript) instead.

To setup Sphinx, you **must** update `hardhat.config.ts` to include the following:

```ts
... // Other plugin imports go here

import '@sphinx/plugins'

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

Next, create a sample Sphinx project:
```
npx hardhat sphinx-init
```

This command created a `sphinx/` folder, which is will contain your deployments.

It also created a few files:
* `sphinx/HelloSphinx.config.ts`: The Sphinx config file where your first deployment is defined.
* `contracts/HelloSphinx.sol`: The smart contract that will be deployed.
* `test/HelloSphinx.spec.ts`: The test file for your deployment.

To deploy `HelloSphinx.sol` locally:
```
npx hardhat sphinx-deploy --config-path sphinx/HelloSphinx.config.ts
```

To test your deployment:
```
npx hardhat test test/HelloSphinx.spec.ts
```

## Setup Sphinx using JavaScript

If you have a JavaScript Hardhat project, follow these instructions. Otherwise, go to [the TypeScript instructions](#setup-sphinx-using-typescript) instead.

To setup Sphinx, you **must** update `hardhat.config.js` to include the following:

```js
... // Other plugin imports go here

require('@sphinx/plugins')

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

Next, create a sample Sphinx project:
```
npx hardhat sphinx-init
```

This command created a `sphinx/` folder, which is will contain your deployments.

It also created a few files:
* `sphinx/HelloSphinx.config.js`: The Sphinx config file where your first deployment is defined.
* `contracts/HelloSphinx.sol`: The smart contract that will be deployed.
* `test/HelloSphinx.test.js`: The test file for your deployment.

To deploy `HelloSphinx.sol` locally:
```
npx hardhat sphinx-deploy --config-path sphinx/HelloSphinx.config.js
```

To test your deployment:
```
npx hardhat test test/HelloSphinx.test.js
```

## Learn More

Once you've set up a Sphinx project, the next step is to learn about the [Sphinx
file](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-file.md), which is where
you define deployments.
