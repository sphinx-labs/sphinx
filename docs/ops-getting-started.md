# The Sphinx DevOps Platform

This guide will introduce you to the Sphinx DevOps platform by walking you through a sample multi-chain deployment.

Deployments are a three-step process with the DevOps platform:

1. **Propose**: Simulates the deployment on a fork of each network, then submits the transactions to Sphinx's backend if the simulation succeeds. You can propose from your command line or CI process.
2. **Approve**: The Gnosis Safe owner(s) sign the deployment's unique identifier using a meta transaction. Approvals occur in the Sphinx UI.
3. **Execute**: After a sufficient number of owners have approved the deployment, it's executed trustlessly by Sphinx's backend. It's impossible for Sphinx to execute anything that the Gnosis Safe owners have not explicitly approved.

In this guide, you'll propose a deployment on the command line and then approve it in the Sphinx UI.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Get credentials](#2-get-credentials)
3. [Get an RPC endpoint API key](#3-get-an-rpc-endpoint-api-key)
4. [Add environment variables](#4-add-environment-variables)
5. [Configure your script](#5-configure-your-script)
6. [Add RPC endpoints](#6-add-rpc-endpoints)
7. [Propose on testnets](#7-propose-on-testnets)
8. [Propose on a production network (optional)](#8-propose-on-a-production-network-optional)
9. [Next steps](#9-next-steps)

## 1. Prerequisites

Sphinx is invite-only, so you must have an invite link to follow this guide. [Request access in the Sphinx UI.](https://sphinx.dev)

Make sure that you've already completed one of the following guides:

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)

## 2. Get credentials

You'll need a Sphinx API key and an organization ID. You can get these on the [Sphinx UI](https://www.sphinx.dev/).

## 3. Get an RPC endpoint API key

We recommend getting a private API key from an RPC node provider like [Alchemy](https://www.alchemy.com/). Public RPC endpoints can be flaky, so we don't recommend them for this guide.

## 4. Add environment variables

In your `.env` file, add your Sphinx API key and your RPC endpoint API key:
```
SPHINX_API_KEY=<your API key>
RPC_API_KEY=<your API key>
```

## 5. Configure your script

First, navigate to your deployment script.

Copy and paste the following config template into your `setUp` function:
```
    sphinxConfig.owners = [<your address>];
    sphinxConfig.orgId = <org ID>;
    sphinxConfig.projectName = "My First Project";
    sphinxConfig.threshold = 1;
    sphinxConfig.mainnets;
    sphinxConfig.testnets = [
      Network.sepolia,
      Network.optimism_sepolia,
      Network.arbitrum_sepolia
    ];
```

Fill in the template with your values. The `orgId` is a public field, so you don't need to keep it secret.

## 6. Add RPC endpoints

Include an RPC endpoint for each network in your `foundry.toml`. For example, if you're using Alchemy, your `foundry.toml` might look like this:

```
[rpc_endpoints]
sepolia = "https://eth-sepolia.g.alchemy.com/v2/${RPC_API_KEY}"
optimism_sepolia = "https://opt-sepolia.g.alchemy.com/v2/${RPC_API_KEY}"
arbitrum_sepolia = "https://arb-sepolia.g.alchemy.com/v2/${RPC_API_KEY}"
```

## 7. Propose on testnets

Copy and paste the following command, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script.

Using Yarn or npm:

```
npx sphinx propose <path/to/your-script.s.sol> --testnets
```

Using pnpm:

```
pnpm sphinx propose <path/to/your-script.s.sol> --testnets
```

Sphinx will propose all of the transactions in your `run()` function that are broadcasted by Foundry. Sphinx will display the transactions in a preview, which you'll be prompted to confirm.

Follow the instructions in the terminal to finish the rest of the deployment.

## 8. Propose on a production network (optional)

To propose a deployment on a production network, you simply need to add a `sphinxConfig.mainnets` option to the `setUp` function in your deployment script. For example:

```
sphinxConfig.mainnets = [
  Network.optimism
]
```

Then, propose using the `--mainnets` option, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script.

Using Yarn or npm:

```
npx sphinx propose <path/to/your-script.s.sol> --mainnets
```

Using pnpm:

```
pnpm sphinx propose <path/to/your-script.s.sol> --mainnets
```

Follow the instructions in the terminal to finish the rest of the deployment.

## 9. Next steps

When you're ready to write your own deployment scripts, see the [Writing Deployment Scripts guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md).
