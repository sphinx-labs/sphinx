# CLI Propose Command

## Table of Contents

- [Overview](#overview)
- [Usage](#usage)
  - [Parameters](#parameters)
  - [Options](#options)
- [Examples](#examples)

## Overview
The `propose` command proposes a deployment in the Sphinx DevOps Platform.

The following steps occur when this command is run:
1. **Simulation**: Sphinx simulates the deployment by invoking the script's `run()` function on a fork of each network. If a transaction reverts during the simulation, Sphinx will throw an error.
2. **Preview**: Sphinx displays the broadcasted transactions in a preview, which the user will be prompted to confirm.
3. **Relay**: Sphinx submits the deployment to the Sphinx UI, where the user will approve it.

## Usage

Using `npx`:

```
npx sphinx propose <SCRIPT_PATH> --networks <testnets|mainnets> [options]
```

Using `pnpm`:

```
pnpm sphinx propose <SCRIPT_PATH> --networks <testnets|mainnets> [options]
```

### Parameters
- `<SCRIPT_PATH>`: **Required**. The path to the Forge script file to propose.

### Options
- `--networks <testnets|mainnets>`: **Required**. Choose between proposing on the test networks (`sphinxConfig.testnets`) or the production networks (`sphinxConfig.mainnets`) in your script.
- `--confirm`: **Optional**. Optionally confirm the proposal without previewing it. Useful for automating proposals.
- `--dry-run`: **Optional**. Perform a trial run without sending data to Sphinx's backend. Useful for testing and validation.
- `--silent`: **Optional**. Suppress output to display only error messages. Combine with `--confirm` for silent, confirmed deployments.
- `--target-contract <TARGET_CONTRACT>`: **Optional**. Specify a contract in multi-contract scripts. Alias: `--tc <TARGET_CONTRACT>`.

## Examples
1. Propose a deployment on testnets using a script located at `./path/to/script.s.sol`:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks testnets
   ```

2. Dry run a proposal on production networks using a script located at `./path/to/script.s.sol`:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks mainnets --dry-run
   ```

3. Propose a script at `./path/to/script.s.sol` on production networks, skipping the deployment preview:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --networks mainnets --confirm
   ```
