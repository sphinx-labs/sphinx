# Getting Started with an Existing Foundry Project

In this guide, you'll integrate Sphinx's Foundry plugin with your existing Foundry project. Then, you'll deploy it on a few testnets.

Deployments are a three-step process with the DevOps platform:

1. **Propose**: Initiate the deployment from your command line or CI process by submitting the transactions to Sphinx's backend.
2. **Approve**: Your Gnosis Safe owner(s) approve the deployment by signing a single meta transaction in the Sphinx UI.
3. **Execute**: Sphinx's backend trustlessly executes the deployment through your Gnosis Safe.

In this guide, you'll propose the deployment on the command line and then approve it in the Sphinx UI.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Update Foundry](#2-update-foundry)
3. [Install Sphinx](#3-install-sphinx)
4. [Update `.gitignore`](#4-update-gitignore)
5. [Update `foundry.toml`](#5-update-foundrytoml)
6. [Add remappings](#6-add-remappings)
7. [Update your deployment script](#7-update-your-deployment-script)
  a. [Import Sphinx](#a-import-sphinx)
  b. [Inherit from `Sphinx`](#b-inherit-from-sphinx)
  c. [Update your `run()` function](#c-update-your-run-function)
  d. [Add configuration options](#d-add-configuration-options)
8. [Run tests](#8-run-tests)
9. [Propose on testnets](#9-propose-on-testnets)
10. [Next steps](#10-next-steps)

## 1. Prerequisites

* You must have an existing Foundry project that includes a Forge script. If you don't have these, we recommend following the [Getting Started in a New Repository guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md) instead.
* The following must be installed on your machine:
  * [Foundry](https://book.getfoundry.sh/getting-started/installation)
  * [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/), [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or [pnpm](https://pnpm.io/installation)
  * [Node Version >=16.16.0](https://nodejs.org/en/download). (Run `node -v` to see your current version).
* You must have an invite link to the DevOps platform because it's currently invite-only. [Request access on Sphinx's website.](https://sphinx.dev)
* You must have an account that exists on live networks. This account will own your Gnosis Safe.

## 2. Update Foundry

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

Update your `foundry.toml` file to include a few settings required by Sphinx. We recommend putting them under `[profile.default]`.

```
ffi = true
build_info = true
extra_output = ['storageLayout']
fs_permissions = [{ access = "read-write", path = "./"}]
allow_paths = ["../.."]
```

## 6. Add remappings

Run the following command to generate remappings for the Sphinx packages.

Using Yarn or npm:

```bash
npx sphinx remappings
```

Using pnpm:

```bash
pnpm sphinx remappings --pnpm
```

Copy and paste the remappings into your `remappings.txt` file or the `remappings` array in your `foundry.toml`.

## 7. Update your deployment script

Navigate to your deployment script. We'll adjust it slightly in this section.

#### a. Import Sphinx

Add the following import in your deployment script:

```sol
import "@sphinx-labs/plugins/SphinxPlugin.sol";
```

#### b. Inherit from `Sphinx`

Inherit from `Sphinx` in your deployment script.

```sol
contract MyDeploymentScript is
  Sphinx,
  // Existing parent contracts:
  // ...
```

#### c. Update your `run()` function

The entry point of your deployment script must be a `run()` function; it cannot be named anything else. Please change its name if necessary.

Then, add a `sphinx` modifier to your `run` function:

```sol
function run() sphinx public override {
    ...
}
```

We'll explain the Sphinx modifier in a later guide.

#### d. Add configuration options

There are a few configuration options that you must specify inside the `setUp()` function or constructor in your deployment script. These options all exist on the `sphinxConfig` struct, which is inherited from `Sphinx.sol`.

```sol
sphinxConfig.owners = [<your address>];
sphinxConfig.orgId = <Sphinx org ID>;
sphinxConfig.projectName = "My First Project";
sphinxConfig.threshold = 1;
sphinxConfig.mainnets;
sphinxConfig.testnets = [
  Network.sepolia,
  Network.optimism_sepolia,
  Network.polygon_mumbai
];
```

Enter your address in the `owners` array and enter your Sphinx Organization ID in the `orgId` field. You can find the organization ID in the Sphinx UI. The `orgId` is a public field, so you don't need to keep it secret.

## 8. Run tests

You've finished integrating Sphinx! Your next step is to check that your existing tests are passing. Go ahead and run your Forge tests.

If you can't get your test suite to pass, we're more than happy to help! Reach out to us in our [Discord](https://discord.gg/7Gc3DK33Np).

## 9. Propose on testnets

Copy and paste one of the following commands to propose your deployment with the DevOps platform.

Using Yarn or npm:

```
npx sphinx propose script/HelloSphinx.s.sol --testnets
```

Using pnpm:

```
pnpm sphinx propose script/HelloSphinx.s.sol --testnets
```

Here are the steps that occur when you run this command:
1. **Simulation**: Sphinx simulates the deployment by invoking the script's `run()` function on a fork of each network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which you'll be prompted to confirm.
3. **Relay**: Sphinx submits the deployment to the website, where you'll approve it in the next step.

When the proposal is finished, go to the [Sphinx UI](https://sphinx.dev) to approve the deployment. After you approve it, you can monitor the deployment's status in the UI while it's executed.

## 10. Next steps

Before you use Sphinx in production, we recommend reading the [Writing Deployment Scripts with Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md), which covers essential information for using Sphinx.
