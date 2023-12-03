# The Sphinx DevOps Platform

This guide will introduce you to the Sphinx DevOps platform by walking you through a sample multi-chain deployment.

Deployments are a three-step process with the DevOps platform:

1. **Propose**: Initiates the deployment from the command line or a CI process. The deployment is simulated, then the transactions are submitted to Sphinx's backend. Proposals happen entirely off-chain.
2. **Approve**: The Gnosis Safe owner(s) sign the deployment's unique identifier using a meta transaction. This occurs in the Sphinx UI.
3. **Execute**: After the deployment has been approved by a sufficient number of owners, it's executed trustlessly by Sphinx's backend. It's impossible for Sphinx to execute anything that the Gnosis Safe owners have not explicitly approved.

In this guide, you'll propose a deployment on the command line then approve it in the Sphinx UI.

## Table of Contents

TODO(md-end)

## 1. Prerequisites

Sphinx is currently invite-only. You must receive an invite link to follow along with this guide. [Request access in the Sphinx UI.](https://sphinx.dev)

Make sure that you've already completed one of the following guides:

- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)

TODO(md-end): line numbers in headings

## 3. Get credentials

You'll need a Sphinx API key and an organization ID. You can get these on the [Sphinx UI](https://www.sphinx.dev/).

## 4. Get an RPC endpoint API key

We recommend getting a private API key from an RPC node provider like [Alchemy](https://www.alchemy.com/). Public RPC endpoints can be flaky, so we don't recommend them for this guide.

## 5. Add environment variables

In your `.env` file, add your Sphinx API key and your RPC endpoint API key:
```
SPHINX_API_KEY=<your API key>
RPC_API_KEY=<your API key>
```

## 6. Configure your script

First, navigate to your deployment script.

Copy and paste the following config template into your `setUp` function:
```
    sphinxConfig.owners = [<your address>];
    sphinxConfig.orgId = <org ID>;
    sphinxConfig.projectName = "My First Project";
    sphinxConfig.threshold = 1;
    sphinxConfig.mainnets;
    sphinxConfig.testnets = [
      Network.goerli,
      Network.optimism_goerli,
      Network.arbitrum_goerli
    ];
```

Fill in the template with your values. The `orgId` is a public field, so you don't need to keep it secret.

## 7. Add RPC endpoints

Include an RPC endpoint for each network in your `foundry.toml`. For example, if you're using Alchemy, your `foundry.toml` might look like this:

```
[rpc_endpoints]
goerli = "https://eth-goerli.g.alchemy.com/v2/${RPC_API_KEY}"
optimism_goerli = "https://opt-goerli.g.alchemy.com/v2/${RPC_API_KEY}"
arbitrum_goerli = "https://arb-goerli.g.alchemy.com/v2/${RPC_API_KEY}"
```

## 8. Propose on testnets

Copy and paste the following command, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script:

```
npx sphinx propose <path/to/your-script.s.sol> --testnets
```

Sphinx will propose all transactions in your `run()` function that are collected by Foundry. The transactions will be displayed in a preview, which you'll be prompted to confirm.

Follow the instructions in the terminal to finish the rest of the deployment.

## 9. Propose on mainnet (optional)

To propose a deployment on a production network, you simply need to add a `sphinxConfig.mainnets` option to the `setUp` function in your deployment script. For example:

```
sphinxConfig.mainnets = [
  Network.optimism
]
```

Then, propose using the `--mainnets` option, replacing `<path/to/your-script.s.sol>` with the actual path to your deployment script:
```
npx sphinx propose <path/to/your-script.s.sol> --mainnets
```

Follow the instructions in the terminal to finish the rest of the deployment.
