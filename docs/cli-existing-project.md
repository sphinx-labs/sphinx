# Getting Started with an Existing Foundry Project

In this guide, you'll integrate Sphinx with your existing Foundry project. Then, you'll deploy your project on test networks.

Deployments are a three-step process with the DevOps Platform:

1. **Propose**: Initiate the deployment by submitting it to Sphinx's backend from your command line or CI process.
2. **Approve**: Your Gnosis Safe owner(s) approve the deployment in the Sphinx UI by signing the deployment's unique identifier with a meta transaction. This unique identifier is the root of a [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree), which contains all the transaction data for the deployment across every chain.
3. **Execute**: Sphinx's backend trustlessly executes the deployment through your Gnosis Safe.

In this guide, you'll propose the deployment on the command line and then approve it in the Sphinx UI.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Sphinx CLI](#2-install-sphinx-cli)
3. [Update Foundry](#3-update-foundry)
4. [Install Sphinx Foundry library](#4-install-sphinx-foundry-library)
5. [Update `.gitignore`](#5-update-gitignore)
6. [Add remapping](#6-add-remapping)
7. [Create a new Sphinx project](#7-create-a-new-sphinx-project)
8. [Generate your sphinx.lock file](#8-generate-your-sphinxlock-file)
9. [Update your deployment script](#9-update-your-deployment-script)\
  a. [Import Sphinx](#a-import-sphinx)\
  b. [Inherit from `Sphinx`](#b-inherit-from-sphinx)\
  c. [Add the `sphinx` modifier](#c-add-the-sphinx-modifier)\
  d. [Remove broadcasts](#d-remove-broadcasts)\
  e. [Handle new sender address](#e-handle-new-sender-address)\
  f. [Configure project name](#f-configure-project-name)
10. [Add environment variables](#10-add-environment-variables)
11. [Update `foundry.toml` settings](#11-update-foundrytoml-settings)
12. [Propose on testnets](#12-propose-on-testnets)
13. [Next steps](#13-next-steps)

## 1. Prerequisites

* You must have a running instance of the [Sphinx Platform](https://github.com/sphinx-labs/sphinx-platform/block/main/docs/local.md).
* You must have an existing Foundry project that includes a Forge script. If you don't, we recommend following the [Getting Started in a New Repository guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md) instead.
* You must have an RPC node provider API key. If you don't already have one, we recommend [Alchemy](https://www.alchemy.com/) or [Infura](https://www.infura.io/).
* You must have an account that exists on live networks. This account will own your Gnosis Safe.
* The following must be installed on your machine:
  * [Foundry](https://book.getfoundry.sh/getting-started/installation)
  * [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/), [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or [pnpm](https://pnpm.io/installation)
  * [Node Version >=16.16.0](https://nodejs.org/en/download). (Run `node -v` to see your current version).

## 2. Install Sphinx CLI

Navigate to your smart contract workspace. In a standard repo, this is the root of your project. In a monorepo, you should move to your contracts package.

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


## 3. Update Foundry
```
foundryup
```

## 4. Install Sphinx Foundry Library

Use the `sphinx install` command to install the Sphinx Foundry library.

Yarn:
```
yarn sphinx install
```

npm:
```
npx sphinx install
```

pnpm:
```
pnpm sphinx install
```

## 5. Update `.gitignore`

Add the following to your `.gitignore` file:
```
node_modules/
```

## 6. Add remapping

Configure the following remapping in either your `foundry.toml` file or `remappings.txt` file:

```
@sphinx-labs/contracts/=lib/sphinx/packages/contracts/contracts/foundry
```

## 7. Create a new Sphinx project
Go to the [Sphinx website](https://sphinx.dev), sign up, and click the "Create Project" button. After you've finished creating the project, you'll see your Org ID, API Key, and Project Name on the website. You'll need these values for the rest of the guide.

## 8. Generate your `sphinx.lock` file
Sphinx uses a lock file to track your project configuration options. To generate this file, run the command:
```
npx sphinx sync --org-id <ORG_ID>
```

Commit the file to version control:
```
git add sphinx.lock
git commit -m "maint: Creating Sphinx lock file"
```

## 9. Update your deployment script

Navigate to your deployment script. In this section, we'll update it to be compatible with Sphinx.

### a. Import Sphinx

Add the following import in your deployment script:

```sol
import "@sphinx-labs/contracts/SphinxPlugin.sol";
```

### b. Inherit from `Sphinx`

Inherit from `Sphinx` in your deployment script.

```sol
contract MyDeploymentScript is
  Sphinx,
  // Existing parent contracts:
  // ...
```

### c. Add the `sphinx` modifier

Navigate to the entry point function in your deployment script. This is typically a `run()` function.

Then, add a `sphinx` modifier to this function. For example:

```sol
function run() sphinx public {
    ...
}
```

We'll explain the Sphinx modifier in a later guide.


### d. Remove broadcasts

Remove any `vm.startBroadcast` and `vm.broadcast` calls from your deployment script. Broadcasting is no longer required because you won't be executing your deployment from the CLI.

### e. Handle new sender address

When using Sphinx, your deployment will be executed from your Gnosis Safe. In other words, the `msg.sender` of your transactions will be your Gnosis Safe. You may need to update your script if it relies on a particular sender address. If you need to access your Gnosis Safe address, you can fetch it in your script using `safeAddress()`.

For example, you may need to:
- Update hardcoded contract addresses
- Assign permissions using your Gnosis Safe address

### f. Configure Project Name

Copy and paste the following `configureSphinx()` function template into your script:

```sol
function configureSphinx() public override {
  sphinxConfig.projectName = <your_project_name>;
}
```

You'll need to update the `projectName` field to match the Project Name you created in the Sphinx UI.

## 10. Add environment variables

Add your Sphinx instance url to your environment file:
```
SPHINX_MANAGED_BASE_URL=<your_sphinx_instance_url>
```

Get your Sphinx API Key from the Sphinx UI and add it as an environment variable:
```
SPHINX_API_KEY=<your_api_key>
```

Also, if you haven't added your node provider API key as an environment variable, please do so now. For example:
```
ALCHEMY_API_KEY=<your_api_key>
```

## 11. Update `foundry.toml` settings

Update your `foundry.toml` file to include a few settings required by Sphinx. We recommend putting them in `[profile.default]`.

```
extra_output = ['storageLayout']
fs_permissions = [{ access = "read-write", path = "./"}]
```
## 12. Propose on testnets

Use one of the command templates below to propose your deployment. Make sure to update the following parts of the command:
* Replace `<PATH_TO_FORGE_SCRIPT>` with the path to your Forge script.
* Replace `<NETWORK_NAMES>` with the testnets you want to deploy on, which must match the network names in the `rpc_endpoints` section of your `foundry.toml`.
* If your script's entry point is a function other than `run()`, add `--sig [PARAMETERS]` to the command, where `[PARAMETERS]` is either the signature of the function to call in the script, or raw calldata. Sphinx's `--sig` parameter accepts the same arguments as Foundry's `--sig` parameter; see docs [here](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-propose.md#options).

Using Yarn or npm:

```
npx sphinx propose <PATH_TO_FORGE_SCRIPT> --networks <NETWORK_NAMES>
```

Using pnpm:

```
pnpm sphinx propose <PATH_TO_FORGE_SCRIPT> --networks <NETWORK_NAMES>
```

Here are the steps that occur when you run this command:
1. **Simulation**: Sphinx simulates the deployment by invoking the Forge script on a fork of each network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which you'll be prompted to confirm.
3. **Relay**: Sphinx submits the deployment to the website, where you'll approve it in the next step.

When the proposal is finished, go to the [Sphinx UI](https://sphinx.dev) to approve the deployment. After you approve it, you can monitor the deployment's status in the UI while it's executed.

## 13. Next steps

Before you use Sphinx in production, we recommend reading the [Writing Deployment Scripts with Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md), which covers essential information for using Sphinx.
