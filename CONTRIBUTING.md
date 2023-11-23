# Sphinx Contributing Guide

Thanks for your interest in helping to improve Sphinx!

## Writing issues

Sphinx tracks features and bug fixes in GitHub Issues. If you're planning to make a large PR, please make sure that there's a corresponding issue that tracks the work you're doing.

When writing an issue, please include as much detail as possible.
Another contributor should be able to tackle the problem based on the information included in the issue.

## Setting up your development environment

### Prerequisites

You'll need to have the following pieces of software installed before you can start working on this repository:

- [Git](https://git-scm.com/downloads)
- [NodeJS](https://nodejs.org/en/download/)
- [NVM](https://github.com/nvm-sh/nvm)
- [Yarn 1.x](https://classic.yarnpkg.com/en/docs/install)

### Cloning and installing

Once you've installed the necessary prerequisites, you'll need to clone the Sphinx monorepo and install its dependencies:

```sh
git clone https://github.com/sphinx-labs/sphinx.git
cd sphinx
yarn install
```

### Install the correct version of Node using NVM

Using `nvm`, install the correct version of NodeJS:

```sh
nvm use
```

### Et voilà

You've set up everything necessary to start working on Sphinx.
Hopefully that wasn't too bad.

## Common development stuff

### Environment Variables
You'll want to define some environment variables when working with Sphinx locally. Environment variables are required for the plugins, executor, and demo packages. You'll find `.env.example` files in each of those directories which describe the necessary variables.

### Building

```sh
yarn clean
yarn build
```

### Linting

```sh
yarn lint
```

### Testing
We currently have automated tests in our contracts, core, and plugins packages.

To run the complete automated test suite, you'll need to create an `.env` file in the `packages/plugins` directory with an environment variable:
```
DEV_FILE_PATH=./
```

Once you've define those environment variables, run the tests:
```sh
yarn test
```

## Conventional commits

Please use the [conventional commit](https://www.conventionalcommits.org) format for commit messages.
We use the following scopes for conventional commits:

- packages/contracts: `ct`
- packages/core: `core`
- packages/demo: `demo`
- packages/plugins: `pg`
- ci: `ci`
- meta: `meta`

## Mergify

We use a tool called Mergify for automatically merging pull requests under certain conditions.
Even if you have direct contributing access to this repository, please make sure to use Mergify to merge your pull requests unless there's a good reason to merge manually.

## Releases with Changesets

We use [changesets](https://github.com/changesets/changesets) to manage releases.
Changesets is a convenient way to handle the release process.
Changesets also generates nice changelogs that users can read to see what changed within a package.

Whenever you make a change that touches code that would be included in the bundled version of a package (usually anything except tests), please include a changeset by running `npx changeset` at the root level of this monorepo.
You will be prompted to select the scope of your change (major, minor, or patch).
You will also be asked to give a short description of the change, which will be included in the changelog for the package.

Packages are released automatically whenever `develop` is merged into `main`.
