# Getting Started in an Existing Repository

This guide will show you how to integrate Sphinx's Foundry CLI plugin into an existing repository. We'll create a sample project, then test and deploy it locally.

## Table of Contents

TODO(md-end)

## 1. Prerequisites

The following must be installed on your machine:
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/), [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or [pnpm](https://pnpm.io/installation)
- [Node Version >=16.16.0](https://nodejs.org/en/download). (Run `node -v` to see your current version).

You must also have a basic understanding of how to use Foundry and Forge scripts. Here are the relevant guides in the Foundry docs:
* [Getting Started with Foundry](https://book.getfoundry.sh/getting-started/first-steps)
* [Writing Deployment Scripts with Foundry](https://book.getfoundry.sh/tutorials/solidity-scripting)

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

## 5. Update `foundry.toml`

Update your `foundry.toml` file to include a few settings that are needed to run Sphinx. We recommend putting them under `[profile.default]`.

```
ffi = true
build_info = true
extra_output = ['storageLayout']
fs_permissions = [{ access = "read-write", path = "./"}]
```

## 6. Initialize a project

Using Yarn or npm:

```
npx sphinx init
```

Using pnpm:

```
pnpm sphinx init --pnpm
```

TODO: move the remappings to another section? it may be more natural to keep it in this section b/c the user will notice the remappings in the terminal after running the command.

This command outputs a set of remappings that you'll need to add to your `foundry.toml` or `remappings.txt` file. If you don't already have a `remappings.txt` file or a `remappings` section in your `foundry.toml`, we recommend adding a `remappings.txt` file in the root of your repository.

This command also created a few files:
- `HelloSphinx.sol`: A sample contract to deploy. This file is written to your existing contract folder, which defaults to `src/`.
- `HelloSphinx.s.sol`: A sample Sphinx deployment script. This file is written to your existing script folder, which defaults to `script/`.
- `HelloSphinx.t.sol`: A sample test file for the deployment. This file is written to your existing test folder, which defaults to `test/`.

## 7. Test the deployment

Test the deployment by running:
```
forge test --match-contract HelloSphinxTest
```

## 8. Next steps

If you'd like to try out the DevOps platform, see the [Sphinx DevOps Platform guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/ops-getting-started.md).

If you'd like to learn more about writing deployment scripts with Sphinx, see the [Writing Deployment Scripts with Sphinx guide](https://github.com/sphinx-labs/sphinx/blob/main/docs/writing-scripts.md).
