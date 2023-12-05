# Using Sphinx in CI

It's a best practice to propose deployments from a CI process instead of using the command line. This ensures that your deployments are reproducible and that they don't depend on a single developer's machine, which can be a source of bugs.

This guide will show you how to integrate proposals into your CI process. We'll create two workflows: one that dry runs the proposal when a pull request is opened or updated, and another that proposes the deployment when the pull request is merged.

We'll use GitHub Actions as the CI platform in this guide. You can still follow this guide if you're using a different CI platform, but the exact configuration may be slightly different.

> Important: Sphinx will propose all transactions that are broadcasted by Foundry. By default, this is **not idempotent**. This means that if you open a PR after completing a deployment, Sphinx will attempt to re-propose any transactions from your script that can be broadcasted again. In most cases, this is not desirable behavior. To resolve this, we highly recommend making your deployment script idempotent.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create a new branch](#2-create-a-new-branch)
3. [Create a GitHub Actions folder](#3-create-a-github-actions-folder)
4. [Create new workflow files](#4-create-new-workflow-files)
5. [Create the dry run workflow](#5-create-the-dry-run-workflow)
6. [Create the proposal workflow](#6-create-the-proposal-workflow)
7. [Configure secret variables](#7-configure-secret-variables)
8. [Test your integration](#8-test-your-integration)
9. [Production Deployments](#9-production-deployments)

## 1. Prerequisites

The Sphinx DevOps Platform is currently invite-only, so you need an invite link to follow along with this guide. You can [request access on our website](https://sphinx.dev) if you haven't already.

Make sure that you've already completed the [Sphinx DevOps Platform guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/ops-getting-started.md).

Also, make sure that your `foundry.toml` has an `rpc_endpoints` section that contains an RPC endpoint for each network you want to deploy on.

## 2. Create a new branch

```
git checkout -b sphinx/integrate-ci
```

## 3. Create a GitHub Actions folder

If you already have a `.github/` folder, you can skip this step.

Run the following command in the root directory of your project:

```
mkdir -p .github/workflows
```

## 4. Create new workflow files

We'll create one workflow file that will run whenever a pull request is opened or updated, and another workflow file that will run whenever a pull request is merged.

```
touch .github/workflows/sphinx.dry-run.yml
touch .github/workflows/sphinx.deploy.yml
```

## 5. Create the dry run workflow

First, we'll create a workflow that dry runs the proposal whenever a pull request is opened or updated. The dry run includes a simulation for the deployment, which will throw an error if it can't be executed. This prevents you from merging pull requests for deployments that are bound to fail.

Copy and paste the following into your `sphinx.dry-run.yml` file:

```
name: Sphinx Dry Run
env:
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    # Put any node provider API keys or URLs here. For example:
    # ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}

# Trigger the dry run when a pull request is opened or updated.
on: pull_request

jobs:
  sphinx-dry-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
        with:
          version: nightly
      - name: Install Dependencies
        run: yarn --frozen-lockfile
      - name: Dry Run
        run: npx sphinx propose <path/to/your/script.s.sol> --dry-run --testnets
```

Here is a list of things you may need to change in the template:
- Enter any RPC node provider API keys in the `env` section of the template.
- If your repository doesn't use `yarn`, update the `yarn --frozen-lockfile` step under `jobs`.
- Make sure the path to your Sphinx deployment script in the `npx sphinx propose` command is correct.

## 6. Create the proposal workflow
Next, we'll create a workflow that will propose the deployment when a pull request is merged.

Copy and paste the following into your `sphinx.deploy.yml` file:

```
name: Sphinx Propose
env:
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    # Put any node provider API keys or URLs here. For example:
    # ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}

# Trigger the proposal when the pull request is merged.
on:
  push:
    branches:
      - main

jobs:
  sphinx-propose:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
        with:
          version: nightly
      - name: Install Dependencies
        run: yarn --frozen-lockfile
      - name: Propose
        run: npx sphinx propose <path/to/your/script.s.sol> --confirm --testnets
```

Here is a list of things you may need to change in the template:
- Enter any RPC node provider API keys in the `env` section of the template.
- If you want to your target branch to be something other than `main`, update the `branches` section of the template.
- If your repository doesn't use `yarn`, update the `yarn --frozen-lockfile` step under `jobs`.
- Make sure the path to your Sphinx deployment script in the `npx sphinx propose` command is correct.

## 7. Configure secret variables

You'll need to add a few variables as secrets in your CI process. If you're not sure how to add secrets, [see here for a guide by GitHub on storing secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

Here is the list of secrets to add:
- `SPHINX_API_KEY`: You can find this in the Sphinx UI after registering your organization.
- RPC node provider API keys for all target networks. Node providers like Alchemy generally use one API key across all networks that they support.

## 8. Test your integration

Push your branch to GitHub, open a PR, and merge it after the dry run succeeds. Then, you go to the [Sphinx UI](https://www.sphinx.dev) to approve your deployment.

## 9. Production Deployments
In this guide, we've configured the CI process to deploy against test networks. If you want to go straight to production, you can do so by switching the `--testnets` flag with the `--mainnets` flag in both templates.

In practice, you may want something different depending on your workflow. For a more robust setup, we recommend using a `develop` branch and triggering testnet deployments when merging to that branch. We recommend using a separate workflow that triggers deployments on production networks when you merge from your `develop` branch to `main`.
