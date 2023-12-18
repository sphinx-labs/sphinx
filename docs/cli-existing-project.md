# Getting Started with an Existing Foundry Project

In this guide, you'll integrate Sphinx with your existing Foundry project. Then, you'll deploy your project on a few testnets.

Deployments are a three-step process with the DevOps platform:

1. **Propose**: Initiate the deployment from your command line or CI process by submitting the transactions to Sphinx's backend.
2. **Approve**: Your Gnosis Safe owner(s) approve the deployment by signing a single meta transaction in the Sphinx UI.
3. **Execute**: Sphinx's backend trustlessly executes the deployment through your Gnosis Safe.

In this guide, you'll propose the deployment on the command line then approve it in the Sphinx UI.

TODO(end): section numbers

## Table of Contents

TODO(end)

## 1. Prerequisites

* You must have an invite link to the DevOps platform because it's currently invite-only. [Request access on Sphinx's website.](https://sphinx.dev)
* You must have an existing Foundry project that includes a Forge script. If you don't, we recommend following the [Getting Started in a New Repository guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md) instead.
* You must have an RPC node provider API key. If you don't already have one, we recommend [Alchemy](https://www.alchemy.com/) or [Infura](https://www.infura.io/).
* You must have an account that exists on live networks. This account will own your Gnosis Safe.
* The following must be installed on your machine:
  * [Foundry](https://book.getfoundry.sh/getting-started/installation)
  * [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/), [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or [pnpm](https://pnpm.io/installation)
  * [Node Version >=16.16.0](https://nodejs.org/en/download). (Run `node -v` to see your current version).

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

## 8. Add remappings

Run the following command to generate remappings for the Sphinx packages.

Using Yarn or npm:

```bash
npx sphinx remappings
```

Using pnpm:

```bash
pnpm sphinx remappings --pnpm
```

Add the remappings to your `remappings.txt` file or the `remappings` array in your `foundry.toml`.

## 5. Add environment variables

Get your Sphinx API Key from the Sphinx UI, then enter it as an environment variable:
```
SPHINX_API_KEY=<your_api_key>
```

TODO: it doesn't make sense that you ask them to enter their RPC providers before mentioning the networks that they'll deploy on.

Also, if you haven't added your node provider API key as an environment variable, please do so now. For example:
```
ALCHEMY_API_KEY=<your_api_key>
INFURA_API_KEY=<your_api_key>
```

## 9. Update your deployment script

Navigate to your deployment script. In this section, we'll update it to be compatible with Sphinx.

### a. Import Sphinx

Add the following import in your deployment script:

```sol
import "@sphinx-labs/plugins/SphinxPlugin.sol";
```

### b. Inherit from `Sphinx`

Inherit from `Sphinx` in your deployment script.

```sol
contract MyDeploymentScript is
  Sphinx,
  // Existing parent contracts:
  // ...
```

### c. Update your `run()` function

The entry point of your deployment script must be a `run()` function; it cannot be named anything else. Please change its name if necessary.

Then, add a `sphinx` modifier to your `run` function:

```sol
function run() sphinx public override {
    ...
}
```

We'll explain the Sphinx modifier in a later guide.


### d. Remove broadcasts

Remove any `vm.startBroadcast` and `vm.broadcast` calls from your deployment script. Broadcasting is no longer required because you aren't be executing your deployment from the CLI.

### e. Add configuration options

There are a few configuration options that you must specify inside the `setUp()` function or constructor in your deployment script. These options all exist on the `sphinxConfig` struct, which is inherited from `Sphinx.sol`.

Copy and paste the following config template into your `setUp` function or constructor:

```sol
sphinxConfig.owners = [<your address>];
sphinxConfig.orgId = <Sphinx org ID>;
sphinxConfig.testnets = [
  Network.sepolia,
  Network.optimism_sepolia,
  Network.arbitrum_sepolia
];
sphinxConfig.projectName = "My First Project";
sphinxConfig.threshold = 1;
```

You'll need to update the following fields in this template:
* Enter your address in the `owners` array.
* Enter your Sphinx Organization ID in the `orgId` field. It's a public field, so you don't need to keep it secret. You can find it in the Sphinx UI.
* If you'd like to deploy on networks other than Sepolia, Optimism Sepolia, and Arbitrum Sepolia, update the `testnets` array. You can find a list of valid fields in the [Sphinx Configuration Options reference](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md#network-testnets).

## 7. Update RPC endpoints

Include an RPC endpoint in your `foundry.toml` for each testnet you'd like to deploy on. The names of the RPC endpoints in your `foundry.toml` must match the testnet names in the `sphinxConfig.testnets` array that you defined in your deployment script. For example, `sepolia` is a valid RPC endpoint name, but `ethereum_testnet` is not.

Here's what your `foundry.toml` might look like if you're using Alchemy:

```toml
[rpc_endpoints]
sepolia = "https://eth-sepolia.g.alchemy.com/v2/${RPC_API_KEY}"
optimism_sepolia = "https://opt-sepolia.g.alchemy.com/v2/${RPC_API_KEY}"
arbitrum_sepolia = "https://arb-sepolia.g.alchemy.com/v2/${RPC_API_KEY}"
```

## 6. Update `foundry.toml` settings

Update your `foundry.toml` file to include a few settings required by Sphinx. We recommend putting them in `[profile.default]`.

```
ffi = true
build_info = true
extra_output = ['storageLayout']
fs_permissions = [{ access = "read-write", path = "./"}]
allow_paths = ["../.."]
```

## 10. Run tests

You've finished integrating Sphinx! Your next step is to check that your existing tests are passing. Go ahead and run your Forge tests.

If you can't get your test suite to pass, we're more than happy to help! Reach out to us in our [Discord](https://discord.gg/7Gc3DK33Np).

## 11. Propose on testnets

Copy and paste one of the following commands to propose your deployment with the DevOps platform. Make sure to replace `<path/to/your/script.s.sol>` with the path to your Forge script.

Using Yarn or npm:

```
npx sphinx propose <path/to/your/script.s.sol> --testnets
```

Using pnpm:

```
pnpm sphinx propose <path/to/your/script.s.sol> --testnets
```

Here are the steps that occur when you run this command:
1. **Simulation**: Sphinx simulates the deployment by invoking the script's `run()` function on a fork of each network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which you'll be prompted to confirm.
3. **Relay**: Sphinx submits the deployment to the website, where you'll approve it in the next step.

When the proposal is finished, go to the [Sphinx UI](https://sphinx.dev) to approve the deployment. After you approve it, you can monitor the deployment's status in the UI while it's executed.

## 12. Next steps

Before you use Sphinx in production, we recommend reading the [Writing Deployment Scripts with Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md), which covers essential information for using Sphinx.
