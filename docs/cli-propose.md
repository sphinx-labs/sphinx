# CLI Propose Command

## Table of Contents

- [Overview](#overview)
- [Usage](#usage)
  - [Parameters](#parameters)
  - [Options](#options)
- [Examples](#examples)

## Overview
The `propose` command proposes a deployment to the Sphinx DevOps Platform.

The following steps occur when this command is run:
1. **Simulation**: Sphinx simulates the deployment by invoking the Forge script on a fork of each network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which the user will be prompted to confirm.
3. **Relay**: Sphinx submits the deployment to the Sphinx UI, where the user will approve it.

> Note: The `propose` command is only available on networks supported by Sphinx's DevOps Platform. See the list of supported networks in the main [README](https://github.com/sphinx-labs/sphinx/blob/main/README.md#networks-supported-by-the-devops-platform).

## Usage

Using `npx`:

```
npx sphinx propose <SCRIPT_PATH> --networks <NETWORK_NAMES...|testnets|mainnets> [options]
```

Using `pnpm`:

```
pnpm sphinx propose <SCRIPT_PATH> --networks <NETWORK_NAMES...|testnets|mainnets> [options]
```

### Parameters
- `<SCRIPT_PATH>`: **Required**. The path to the Forge script file to propose.

### Options
- `--networks <NETWORK_NAMES...|testnets|mainnets>`: **Required**. The network(s) to propose on. Options include:
  - Arbitrary network names (e.g., `ethereum optimism arbitrum`): Propose on one or more networks, which must match the network names in the `rpc_endpoints` section of your `foundry.toml`.
  - `testnets`: Propose on the test networks in your `sphinxConfig.testnets` array. Provides a convenient way to propose on many networks without specifying them on the command line. Requires additional configuration; see the [Configuration Options section for `sphinxConfig.testnets`](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md#string-testnets-optional).
  - `mainnets`: Propose on the production networks in your `sphinxConfig.mainnets` array. Provides a convenient way to propose on many networks without specifying them on the command line. Requires additional configuration; see the [Configuration Options section for `sphinxConfig.mainnets`](https://github.com/sphinx-labs/sphinx/blob/main/docs/configuration-options.md#string-mainnets-optional).
- `--sig <SIGNATURE [PARAMETERS...] | CALLDATA>` (Alias: `-s`): **Optional**. The signature of the function to call in the script, or raw calldata. Matches the interface of Forge Script's `--sig` parameter.
  - **Default**: `run()`
- `--confirm`: **Optional**. Confirm the proposal without previewing it. Useful for automating proposals.
- `--dry-run`: **Optional**. Perform a trial run without sending data to Sphinx's backend. Useful for testing and validation.
- `--silent`: **Optional**. Suppress output to display only error messages. Must be combined with `--confirm` to confirm the proposal without previewing it.
- `--target-contract <TARGET_CONTRACT>` (Alias: `--tc`): **Optional**. Specify a contract in multi-contract scripts.

## Examples
1. Propose a script located at `./path/to/script.s.sol` on Sepolia:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks sepolia
   ```

2. Propose a script located at `./path/to/script.s.sol` on a few production networks:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks ethereum optimism arbitrum
   ```

3. Propose a script located at `./path/to/script.s.sol` on Ethereum by calling the script's `deploy(uint256)` function with the argument `1234`:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks ethereum --sig 'deploy(uint256)' 1234
   ```

4. Propose a script located at `./path/to/script.s.sol` on all networks in `sphinxConfig.testnets`, skipping the deployment preview:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks testnets --confirm
   ```

5. Dry run a proposal on all networks in `sphinxConfig.mainnets` using a script located at `./path/to/script.s.sol`:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks mainnets --dry-run
   ```
