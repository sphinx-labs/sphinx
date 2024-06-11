# Getting Started in a New Repository

This guide will introduce you to Sphinx's Foundry plugin and DevOps Platform by walking you through a sample multi-chain deployment.

Deployments are a three-step process with the DevOps Platform:

1. **Propose**: Initiate the deployment by submitting it to Sphinx's backend from your command line or CI process.
2. **Approve**: Your Gnosis Safe owner(s) approve the deployment in the Sphinx UI by signing the deployment's unique identifier with a meta transaction. This unique identifier is the root of a [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree), which contains all the transaction data for the deployment across every chain.
3. **Execute**: Sphinx's backend trustlessly executes the deployment through your Gnosis Safe.

In this guide, you'll create a sample project, propose it on the command line, and then approve it in the Sphinx UI.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create a new directory](#2-create-a-new-directory)
3. [Update Foundry](#3-update-foundry)
4. [Install dependencies](#4-install-dependencies)
5. [Create a new Sphinx project](#5-create-a-new-sphinx-project)
6. [Initialize Sphinx](#6-initialize-sphinx)
7. [Add your Sphinx Platform instance url](#7-add-your-sphinx-platform-instance-url)
8. [Propose on testnets](#8-propose-on-testnets)
9. [Next steps](#9-next-steps)

## 1. Prerequisites

* You must have a running instance of the [Sphinx Platform](https://github.com/sphinx-labs/sphinx-platform/block/main/docs/local.md).
* You must have a basic understanding of how to use Foundry and Forge scripts. Here are the relevant guides in the Foundry docs:
  * [Getting Started with Foundry](https://book.getfoundry.sh/getting-started/first-steps)
  * [Writing Deployment Scripts with Foundry](https://book.getfoundry.sh/tutorials/solidity-scripting)
* You must have an Alchemy API key, which you can get on [their website](https://www.alchemy.com/).
* You must have an account that exists on live networks. This account will own your Gnosis Safe.
* The following must be installed on your machine:
  * [Foundry](https://book.getfoundry.sh/getting-started/installation)
  * [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/), [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or [pnpm](https://pnpm.io/installation)
  * [Node Version >=16.16.0](https://nodejs.org/en/download). (Run `node -v` to see your current version).

## 2. Create a new directory

In your terminal, navigate to the directory where you'd like to create your project. Then, create a new directory:

```
mkdir hello_sphinx && cd hello_sphinx
```

## 3. Update Foundry
```
foundryup
```

## 4. Install dependencies

Install Sphinx, forge-std, and ds-test using your preferred package manager.

Yarn:
```
yarn add --dev @sphinx-labs/plugins https://github.com/foundry-rs/forge-std.git#v1.7.1 https://github.com/dapphub/ds-test.git#e282159d5170298eb2455a6c05280ab5a73a4ef0
```

npm:
```
npm install --save-dev @sphinx-labs/plugins https://github.com/foundry-rs/forge-std.git#v1.7.1 https://github.com/dapphub/ds-test.git#e282159d5170298eb2455a6c05280ab5a73a4ef0
```

pnpm:
```
pnpm add -D @sphinx-labs/plugins https://github.com/foundry-rs/forge-std.git#v1.7.1 https://github.com/dapphub/ds-test.git#e282159d5170298eb2455a6c05280ab5a73a4ef0
```

## 5. Create a new Sphinx project
Go to the [Sphinx website](https://sphinx.dev), sign up, and click the "Create Project" button. After you've finished creating the project, you'll see your Org ID, API Key, and Project Name on the website. You'll need these values for the rest of the guide.

## 6. Initialize Sphinx

Run one of the following commands on your command line, replacing the placeholders with your values. We've included a description of each command line argument below.

Using Yarn or npm:

```
npx sphinx init --org-id <ORG_ID> --sphinx-api-key <API_KEY> --project <PROJECT_NAME> --alchemy-api-key <API_KEY>
```

Using pnpm:

```
pnpm sphinx init --org-id <ORG_ID> --sphinx-api-key <API_KEY> --project <PROJECT_NAME> --alchemy-api-key <API_KEY> --pnpm
```

Command line argument descriptions:
* `--org-id <ORG_ID>`: Your organization ID from the Sphinx UI (under "Options" -> "API Credentials").
* `--sphinx-api-key <API_KEY>`: Your API key from the Sphinx UI (under "Options" -> "API Credentials").
* `--alchemy-api-key <API_KEY>`: Your Alchemy API Key.
* `--project <PROJECT_NAME>`: Your project name from the Sphinx UI.
* `--pnpm`: An optional flag that creates remappings for pnpm.

After you run the command, you'll notice several new files:
- `src/HelloSphinx.sol`: A sample contract to deploy.
- `test/HelloSphinx.t.sol`: A test file for the deployment.
- `script/HelloSphinx.s.sol`: A Sphinx deployment script.
- `foundry.toml`: The Foundry config file, which contains a few settings required by Sphinx.
- `.env`: A sample `.env` file that contains your credentials.
- `.gitignore`: A sample `.gitignore` file that contains files and directories generated by Sphinx, Foundry, and Node.

## 7. Add your Sphinx Platform instance url
Add your Sphinx instance URL to your environment file:
```
SPHINX_MANAGED_BASE_URL=<your_sphinx_instance_url>
```

## 8. Propose on testnets

Copy and paste one of the following commands to propose your deployment with the DevOps Platform.

Using Yarn or npm:

```
npx sphinx propose script/HelloSphinx.s.sol --networks sepolia optimism_sepolia arbitrum_sepolia
```

Using pnpm:

```
pnpm sphinx propose script/HelloSphinx.s.sol --networks sepolia optimism_sepolia arbitrum_sepolia
```

Here are the steps that occur when you run this command:
1. **Simulation**: Sphinx simulates the deployment by invoking the Forge script on a fork of each network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which you'll be prompted to confirm.
3. **Relay**: Sphinx submits the deployment to the website, where you'll approve it in the next step.

When the proposal is finished, go to the [Sphinx UI](https://sphinx.dev) to approve the deployment. After you approve it, you can monitor the deployment's status in the UI while it's executed.

## 9. Next steps

Congrats, you've finished your first deployment with Sphinx!

When you're ready to write your own deployment scripts with Sphinx, see the [Writing Deployment Scripts guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md).
