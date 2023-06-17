# Getting Started

In this guide, you'll learn how to test and deploy a contract using ChugSplash.

## Table of Contents

1. [Setup a Foundry project](#1-setup-a-foundry-project)
2. [Install ChugSplash](#2-install-chugsplash)
3. [Configure your `foundry.toml` file](#3-configure-your-foundrytoml-file)
4. [Update remappings](#4-update-remappings)
5. [Initialize ChugSplash](#5-initialize-chugsplash)
6. [Run the tests](#6-run-the-tests)
7. [Deploy on Anvil](#7-deploy-on-anvil)
8. [Generate deployment artifacts](#8-generate-deployment-artifacts)

## Prerequisites

Install the following on your system:
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm#overview) or [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/). You can check if one is installed by running `npm -v` or `yarn -v`.
- [Node.js >= v18.16.0](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm#overview). Although we support Node.js >= v14, we **highly recommend** using v18.16.0 or later because it runs our Foundry plugin significantly faster.
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

You must also have a basic understanding of how to use Foundry. [See here](https://book.getfoundry.sh/getting-started/first-steps) for a brief introduction.

## 1. Setup a Foundry project

If you have an existing foundry project, navigate to it then [skip to step #2](#2-install-chugsplash).

If you're starting a new project, run:

```
forge init hello_foundry && cd hello_foundry
```

Then, delete the files that come with the default Foundry project:
```
rm src/Counter.sol script/Counter.s.sol test/Counter.t.sol
```

## 2. Install ChugSplash

In your project root, run:

```
npm install @chugsplash/plugins
```

or

```
yarn add @chugsplash/plugins
```

You may also want to add `node_modules` to your .gitignore file.

## 3. Configure your `foundry.toml` file

Edit your `foundry.toml` file to include all of the following options. If you leave any of these out, ChugSplash will not work properly.

```
[profile.default]
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read", path = "./"}]

[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
```

## 4. Update remappings

In your project root run:

```
echo > remappings.txt
```

Inside the newly created file, remappings.txt, copy paste the following:

```
ds-test/=lib/forge-std/lib/ds-test/src/
forge-std/=lib/forge-std/src/
@chugsplash/plugins=node_modules/@chugsplash/plugins/contracts/foundry
@chugsplash/contracts=node_modules/@chugsplash/contracts/contracts/
@openzeppelin/contracts-upgradeable/=node_modules/@openzeppelin/contracts-upgradeable/
@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/
@eth-optimism/contracts-bedrock/=node_modules/@eth-optimism/contracts-bedrock/
@eth-optimism/contracts/=node_modules/@eth-optimism/contracts/
@thirdweb-dev/contracts/=node_modules/@thirdweb-dev/contracts/
solmate/src/=node_modules/solmate/src/
@prb/math/=node_modules/prb/math/src/
```

## 5. Initialize ChugSplash
In your project root, run the following command to generate a Typescript ChugSplash project:
```
npx chugsplash init --ts
```
Or generate a Javascript ChugSplash project:
```
npx chugsplash init --js
```

You'll see we've created a few new files:
- `src/HelloChugSplash.sol`: A sample contract to be deployed
- `chugsplash/HelloChugSplash.config.ts`: A ChugSplash config file, which contains the deployment info for the project
- `script/HelloChugSplash.s.sol`: A script for deploying the sample project
- `script/GenerateArtifact.s.sol`: A script for generating deployment artifacts for the sample project
- `test/HelloChugSplash.t.sol`: A script for running local tests of the project using ChugSplash

The ChugSplash config for the sample project just deploys a single immutable contract HelloChugSplash. We'll explain the details of the ChugSplash config file in the next guide.

## 6. Run the tests
In your project root, run the tests with the following command:
```
forge test
```

## 7. Deploy on anvil
Create a new .env file:
```
echo > .env
```

Add a private key that is valid on anvil:
```
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Start an anvil node:
```
anvil
```

In a new window, run the deployment script:
```
forge script script/HelloChugSplash.s.sol --broadcast
```

## 8. Generate deployment artifacts
After you've broadcast your deployment transactions, you can then generate the associated deployment artifacts:
```
forge script script/GenerateArtifact.s.sol
```

## Learn More

Once you've set up your project, the next step is to learn about the [ChugSplash
config file](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md), which is where
you define deployments using ChugSplash.
