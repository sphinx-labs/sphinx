# Propose in CI

It's a best practice to propose deployments from a CI process instead of using the command line. This ensures that your deployments are reproducible and don't depend on a single developer's machine, which can be a source of bugs.

This guide will show you how to integrate proposals into your GitHub Actions CI process. Currently, Sphinx only officially supports GitHub Actions. If you need support for an alternative CI platform, please let us know. In this guide, we'll create two workflows: one that dry runs the proposal when a pull request is opened or updated, and another that proposes the deployment when the pull request is merged.

> Important: Sphinx will propose all transactions that are broadcasted by Foundry. By default, this is **not idempotent**. If you open a PR after completing a deployment, Sphinx will attempt to re-propose any transactions from your script that can be broadcasted again. In most cases, this is not desirable behavior. To resolve this, we highly recommend making your deployment script idempotent.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create a new branch](#2-create-a-new-branch)
3. [Create a GitHub Actions folder](#3-create-a-github-actions-folder)
4. [Create new workflow files](#4-create-new-workflow-files)
5. [Create the dry run workflow](#5-create-the-dry-run-workflow)
6. [Create the proposal workflow](#6-create-the-proposal-workflow)
7. [Configure secret variables](#7-configure-secret-variables)
8. [Test your integration](#8-test-your-integration)
9. [Production deployments](#9-production-deployments)

## 1. Prerequisites

The Sphinx DevOps Platform is currently invite-only, so you need an invite link to follow along with this guide.  If you haven't already, you can [request access on our website](https://sphinx.dev).

Make sure that you've already completed one of the following guides:
- [Getting Started in a New Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-quickstart.md)
- [Getting Started in an Existing Repository](https://github.com/sphinx-labs/sphinx/blob/main/docs/cli-existing-project.md)

Also, make sure that your `foundry.toml` has an `[rpc_endpoints]` section containing an RPC endpoint for each network you want to deploy on.

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

First, we'll create a workflow that dry runs the proposal on test networks whenever a pull request is opened or updated. The dry run includes a simulation for the deployment, which will throw an error if a transaction reverts. This prevents you from merging pull requests for deployments bound to fail.

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
        uses: foundry/foundry-toolchain@v1
        with:
          version: nightly
      - name: Install Dependencies
        run: yarn --frozen-lockfile
      - name: Install Sphinx Solidity Library
        run: yarn sphinx install
      - name: Dry Run
        run: npx sphinx propose <path/to/your/script.s.sol> --dry-run --networks <NETWORK_NAMES>
```

Here is a list of things you may need to change in the template:
- Enter any RPC node provider API keys in the `env` section of the template.
- If your repository doesn't use Yarn, update the `yarn --frozen-lockfile` step under `jobs`.
- If your repository uses pnpm instead of Yarn or npm, change `npx sphinx propose` to `pnpm sphinx propose`.
- In the `sphinx propose` command, replace `<path/to/your/script.s.sol>` with the path to your Forge script.
- In the `sphinx propose` command, replace `<NETWORK_NAMES>` with the test networks to propose on.

## 6. Create the proposal workflow
Next, we'll create a workflow to propose the deployment when a pull request is merged.

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
        uses: foundry/foundry-toolchain@v1
        with:
          version: nightly
      - name: Install Dependencies
        run: yarn --frozen-lockfile
      - name: Install Sphinx Solidity Library
        run: yarn sphinx install
      - name: Propose
        run: npx sphinx propose <path/to/your/script.s.sol> --confirm --networks <NETWORK_NAMES>
```

Here is a list of things you may need to change in the template:
- Enter any RPC node provider API keys in the `env` section of the template.
- If you want your target branch to be something other than `main`, update the `branches` section of the template.
- If your repository doesn't use Yarn, update the `yarn --frozen-lockfile` step under `jobs`.
- If your repository uses pnpm instead of Yarn or npm, change `npx sphinx propose` to `pnpm sphinx propose`.
- In the `sphinx propose` command, replace `<path/to/your/script.s.sol>` with the path to your Forge script.
- In the `sphinx propose` command, replace `<NETWORK_NAMES>` with the test networks to propose on.

## 7. Configure secret variables

You must add a few variables as secrets in your CI process. If you're not sure how to add secrets, [see here for a guide by GitHub on storing secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

Here is the list of secrets to add:
- `SPHINX_API_KEY`: After registering your organization, you can find this in the Sphinx UI under "Options" -> "API Credentials"
- RPC node provider API keys for all target networks. Node providers like Alchemy generally use one API key across all networks they support.

## 8. Test your integration

Push your branch to GitHub, open a PR, and merge it after the dry run succeeds. Then, go to the [Sphinx UI](https://www.sphinx.dev) to approve your deployment.

## 9. Production deployments

In this guide, we've configured the CI process to deploy against test networks. When you're ready to deploy in production, simply replace the test networks in the `sphinx propose` commands with the names of the production networks. Make sure you update both templates.

In practice, we recommend triggering testnet deployments when merging to your development branch, and triggering production deployments when you merge from your development branch to your main branch.
