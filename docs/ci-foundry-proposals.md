# Propose Deployments from your CI Process (Foundry)

We recommend that you propose from your CI process instead of using the command line. This ensures that your deployments are reproducible, and that they don't depend on a single developer's machine, which can be a source of bugs.

This guide will show you how to integrate proposals into your CI process using GitHub Actions. You can still follow this guide if you're using a different CI platform, but the exact configuration may be slightly different.

If you're using Sphinx's Hardhat plugin instead of Foundry, check out the [Hardhat version of this guide](TODO).

## Table of Contents

TODO

## Prerequisites

Make sure that you've already completed the [Getting Started with the DevOps Platform](TODO) guide for the project you're going to use in this guide.

Also, make sure that your `foundry.toml` have an `rpc_endpoints` section that contains an RPC endpoint for each network you want to support in your project.

## Create a Github Actions folder

If you already have a `.github/` folder, you can skip this step.

Run the following command in the root directory of your project:

`mkdir -p .github/workflows`

## Create a new workflow `deploy.yml`

`touch .github/workflows/deploy.yml`

## Create the action template

We'll create an action template that runs the `propose` command on every push to the `main` branch.

Copy and paste the following into your `deploy.yml` file:

```
name: Sphinx Propose
env:
    PROPOSER_PRIVATE_KEY: ${{ secrets.PROPOSER_PRIVATE_KEY }}
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    # Put any node provider API keys here. For example:
    # ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}
on:
  push:
    branches:
      - main
jobs:
  sphinx-propose:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: yarn install
      - run: TODO
```

Here is a checklist of things to do before moving on:
1. Add the `PROPOSER_PRIVATE_KEY` secret to your CI process. This should be the private key of one of the proposer addresses in your Sphinx config file (under the `proposers` field).
2. Add the `SPHINX_API_KEY` secret to your CI process. You can find these in the Sphinx UI after registering your organization.
3. Enter any node provider API keys in the `env` section of the template. There must be an API key for each network you want to support in your project.
4. If you want to push to a branch other than `main`, update the `branches` section of the template.
5. If your repository doesn't use `yarn install`, update the `yarn install` step under `jobs`.
6. Add the path to your Sphinx config in the `npx sphinx propose` command under `jobs`.

## Test your integration

TODO

TODO: make a guide for hardhat too
