# Propose Deployments from your CI Process (Foundry)

We recommend that you propose from your CI process instead of using the command line. This ensures that your deployments are reproducible, and that they don't depend on a single developer's machine, which can be a source of bugs.

This guide will show you how to integrate proposals into your CI process using GitHub Actions. You can still follow this guide if you're using a different CI platform, but the exact configuration may be slightly different.

If you're using Sphinx's Hardhat plugin instead of Foundry, check out the [Hardhat version of this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-hardhat-proposals.md).

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create a new branch](#2-create-a-new-branch-in-your-repo)
3. [Create a Github Actions folder](#3-create-a-github-actions-folder)
4. [Create new workflow files](#4-create-new-workflow-files-sphinxdeployyml-and-sphinxdry-runyml)
5. [Create the dry run workflow](#5-create-the-dry-run-workflow)
6. [Create the propose workflow](#6-create-the-propose-workflow)
7. [Test your integration](#7-test-your-integration)
8. [Production Deployments](#8-production-deployments)

## 1. Prerequisites

Make sure that you've already completed the [Getting Started with the DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ops-foundry-getting-started.md) guide for the project you're going to use in this guide.

Also, make sure that your `foundry.toml` has an `rpc_endpoints` section that contains an RPC endpoint for each network you want to support in your project.

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

## 4. Create new workflow files `sphinx.deploy.yml` and `sphinx.dry-run.yml`

```
touch .github/workflows/sphinx.dry-run.yml
touch .github/workflows/sphinx.deploy.yml
```

## 5. Create the dry run workflow
We'll first create a workflow that runs the `propose` command with the `--dry-run` flag whenever a PR is opened and updated. Proposing with the dry run flag just checks that the proposal process will complete successfuly. So this check helps prevent you from accidentally merging a change where the deployment might fail during the proposal step.

Copy and paste the following into your `sphinx.dry-run.yml` file:

```
name: Sphinx Dry Run
env:
    PROPOSER_PRIVATE_KEY: ${{ secrets.PROPOSER_PRIVATE_KEY }}
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    # Put any node provider API keys or urls here. For example:
    # ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}

# Performs a dryrun proposal when a PR is opened and updated to confirm the
# proposal will complete successfully after a PR is merged
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
        run: npx sphinx propose --config ./sphinx/HelloSphinx.config.ts --dry-run --testnets
```

## 6. Create the propose workflow
Now we'll create a workflow that runs the `propose` command with the `--confirm` flag. The confirm flag overrides the manual confirmation required by the proposal command allowing the proposal command to complete automatically.

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
        run: npx sphinx propose --config ./sphinx/HelloSphinx.config.ts --confirm --testnets
```

Here is a checklist of things to do before moving on:
- [ ] Add the `PROPOSER_PRIVATE_KEY` secret to your CI process. This should be the private key of one of the proposer addresses in your Sphinx config file (under the `proposers` field).
- [ ] Add the `SPHINX_API_KEY` secret to your CI process. You can find this in the Sphinx UI after registering your organization.
- [ ] Enter any node provider API keys or urls  in the `env` section of the template and make sure they are also [configured as secrets in GitHub actions](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository).
- [ ] If you want to push to a branch other than `main`, update the `branches` section of the template.
- [ ] If your repository doesn't use `yarn --frozen-lockfile`, update the `yarn --frozen-lockfile` step under `jobs`.
- [ ] Add the path to your Sphinx config in the `npx sphinx propose` command under `jobs`.

## 7. Test your integration

Push your branch to Github, open a PR, and merge it after the dryrun check completes. You can then go to https://www.sphinx.dev and you'll find your new deployment there.

## 8. Production Deployments
In this example we've configured the CI deployment process to deploy against test networks when merging to main. If you want to go straight to production, you can do so by switching out the `--testnets` flag for the `--mainnets` production.

However, in practice you may want something different depending on your workflow. For a more robust setup we recommend using a `develop` branch and triggering testnet deployments when merging to that branch. Then you should setup a separate workflow to trigger production deployments when merging to main.
