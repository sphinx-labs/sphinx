# CLI Deploy Command

## Table of Contents

- [Overview](#overview)
- [Use Cases](#use-cases)
  - [Deploy on Anvil](#deploy-on-anvil)
  - [Deploy on Live Networks](#deploy-on-live-networks)
- [Requirements](#requirements)
  - [Live Network Deployments](#live-network-deployments)
- [Usage](#usage)
  - [Parameters](#parameters)
  - [Options](#options)
- [Examples](#examples)

## Overview
The `deploy` command executes a deployment on a single network. This command executes the deployment from your local machine without using the DevOps Platform.

The following steps occur during this command:
1. **Simulation**: Sphinx simulates the deployment by invoking the Forge script on a fork of the network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which you'll be prompted to confirm.
3. **Execute**: Sphinx executes the deployment on the target network.
4. **Deployment Artifacts**: Sphinx will write deployment artifacts to your file system. See the [Deployment Artifacts](https://github.com/sphinx-labs/sphinx/blob/main/docs/deployment-artifacts.md) guide for more information.
5. **Verification** (optional): Sphinx will verify your contracts on Etherscan.

## Use Cases

### Deploy on Anvil

Use the command to execute your deployment on a stand-alone Anvil before going to production. Your deployment will be identical to the production environment, including identical contract addresses and deployment artifacts.

### Deploy on Live Networks

Use the command to execute a deployment on a live network without using the DevOps Platform. This is particularly useful if you need to execute a deployment on a network that the DevOps Platform doesn't currently support.

This command will execute your deployment identically to the DevOps Platform, including equivalent contract addresses and deployment artifacts. However, since you aren't using the DevOps Platform, you'll need native gas tokens for the deployment and an Etherscan API key to verify your contracts.

Currently, you can only use this command on live networks if you're the only owner of the Gnosis Safe. The command does not support multiple owners yet.

If you're deploying on a network where the Sphinx and Gnosis Safe contracts do not exist, the `deploy` command will deploy them using your wallet. If you need to deploy these contracts, the following line will appear in the deployment preview, which you'll be prompted to confirm before any transactions are executed:
```
1. Sphinx & Gnosis Safe Contracts
...
```

## Requirements

### Live Network Deployments

- Add a `PRIVATE_KEY` environment variable. This private key will execute your deployment, so it must have funds on the target network.

## Usage

Using `npx`:

```
npx sphinx deploy <SCRIPT_PATH> --network <NETWORK_NAME> [options]
```

Using `pnpm`:

```
pnpm sphinx deploy <SCRIPT_PATH> --network <NETWORK_NAME> [options]
```

### Parameters
- `<SCRIPT_PATH>`: **Required**. Path to the Forge script file to deploy.

### Options
- `--network <NETWORK_NAME>`: **Required**. The name of the network to deploy on, which must match a network in the `rpc_endpoints` section of your `foundry.toml`.
- `--sig <SIGNATURE [PARAMETERS...] | CALLDATA>` (Alias: `-s`): **Optional**. The signature of the function to call in the script, or raw calldata. Matches the interface of Forge Script's `--sig` parameter.
  - **Default**: `run()`
- `--confirm`: **Optional**. Confirm the deployment without previewing it. Useful for automated deployments.
- `--target-contract <TARGET_CONTRACT>` (Alias: `--tc`): **Optional**. Specify a contract within the script file. Necessary for scripts with multiple contracts.
- `--verify`: **Optional**. Verify the deployment on Etherscan.
- `--silent`: **Optional**. Silence the output except for error messages. Must be combined with `--confirm` to confirm the deployment without previewing it.

## Examples
1. Deploy a script located at `./path/to/script.s.sol` on Ethereum and then verify it on Etherscan:
   ```bash
   npx sphinx deploy ./path/to/script.s.sol --network ethereum --verify
   ```

2. Deploy a script located at `./path/to/script.s.sol` on Anvil and confirm the deployment without previewing it:
   ```bash
   npx sphinx deploy ./path/to/script.s.sol --network anvil --confirm
   ```

3. Deploy a script located at `./path/to/script.s.sol` on Ethereum by calling the script's `deploy(uint256)` function with the argument `1234`:
   ```bash
   npx sphinx deploy ./path/to/script.s.sol --network ethereum --sig 'deploy(uint256)' 1234
   ```
