# Propose from your CI Process (Foundry)

We recommend that you propose from your CI process instead of using the command line. This ensures that your deployments are reproducible, and that they don't depend on a single developer's machine, which can be a source of bugs.

This guide will show you how to integrate proposals into your CI process using GitHub Actions. You can still follow this guide if you're using a different CI platform, but the exact configuration may be slightly different.

This guide assumes that your repository has a main branch and a develop branch. If you're using a different branching strategy, you'll need to modify the templates in this guide accordingly.

> Note: If you're using Sphinx's Hardhat plugin instead of Foundry, check out the [Hardhat version of this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-hardhat-proposals.md).

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Create a new branch](#2-create-a-new-branch-in-your-repo)
- [3. Create a Github Actions folder](#3-create-a-github-actions-folder)
- [4. Create new workflow files](#4-create-new-workflow-files)
- [5. Create the dry run workflow](#5-create-the-dry-run-workflow)
- [6. Create the proposal workflow](#6-create-the-proposal-workflow)
- [7. Configure the templates](#7-configure-the-templates)
- [8. Test your integration](#8-test-your-integration)

## 1. Prerequisites

Make sure that you've already completed the [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md) guide for the project you're going to use in this guide.

Also, make sure that your `foundry.toml` has an `rpc_endpoints` section that contains an RPC endpoint for each network you want to propose on.

## 2. Create a new branch in your repo

```
git checkout -B sphinx/integrate-ci
```

## 3. Create a Github Actions folder

If you already have a `.github/` folder, you can skip this step.

Run the following command in the root directory of your project:

```
mkdir -p .github/workflows
```

## 4. Create new workflow files

TODO:
We'll create two workflow files: one that dry runs the proposal and another that submits the proposal.

The dry run workflow will run whenever a PR is opened or updated. Its purpose is to ensure that the proposal will complete successfully when the PR is merged. Without this, you could merge a PR that results in a failed proposal.

The proposal workflow will run when the PR is merged. This creates a meta transaction that's signed by the proposer then relayed to Sphinx's back-end.

Run the following commands to create the workflow files:

```
touch .github/workflows/sphinx.dry-run.yml
touch .github/workflows/sphinx.deploy.yml
```

## 5. Create the dry run workflow

This workflow runs the `propose` command with the `--dry-run` flag to simulate a proposal without actually submitting it.

Copy and paste the following template into your `sphinx.dry-run.yml` file:

```
name: Sphinx Dry Run
env:
    PROPOSER_PRIVATE_KEY: ${{ secrets.PROPOSER_PRIVATE_KEY }}
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    # Put any node provider API keys or urls here. For example:
    # ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}

# Performs the dry run when a PR is opened and updated
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
        run: npx sphinx propose --dry-run --config <path/to/sphinx/config/file> --testnets
```

## 6. Create the proposal workflow

Now we'll create a workflow that runs the `propose` command with the `--confirm` flag. This flag overrides the manual confirmation step that's normally required in the `propose` command.

```
name: Sphinx Propose
env:
    PROPOSER_PRIVATE_KEY: ${{ secrets.PROPOSER_PRIVATE_KEY }}
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    # Put any node provider API keys or urls here. For example:
    # ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}

# Triggers a deployment when a change is merged to main
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
        run: npx sphinx propose --confirm --config <path/to/sphinx/config/file> --testnets
```

Here is a list of things to configure:
- Add the `PROPOSER_PRIVATE_KEY` secret to your CI process. This should be the private key of one of the proposer addresses in your Sphinx config file. The list of proposers is located under the `options` field in the config file.
- Add the `SPHINX_API_KEY` secret to your CI process. You can find this in the Sphinx UI after registering your organization.
- Enter any node provider API keys or urls in the `env` section and make sure they are also [configured as secrets in GitHub actions](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository).
- If you want to push to a branch other than `main`, update the `branches` section of the templates.
- If your repository doesn't use `yarn --frozen-lockfile`, update the `yarn --frozen-lockfile` step under `jobs`.
- Add the path to your Sphinx config file in the `npx sphinx propose` commands under `jobs`.

## 8. Test your integration

We recommend proposing a sample project to test that your CI process works properly. When a proposal is triggered, it will appear in the [Sphinx UI](https://www.sphinx.dev).
