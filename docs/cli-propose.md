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
```bash
npx sphinx propose <scriptPath> [--testnets|--mainnets] [--confirm] [--dry-run] [--silent] [--tc <targetContract>]
```

### Parameters
- `<scriptPath>`: **Required**. The path to the Forge script file to propose.

### Options
- `--testnets`: (boolean) Propose on the 'sphinxConfig.testnets' in the script. You are required to either specify this flag or `--mainnets`.
- `--mainnets`: (boolean) Propose on the 'sphinxConfig.mainnets' in the script. You are required to either specify this flag or `--testnets`.
- `--confirm`: (boolean) Confirm the proposal without previewing it.
- `--dry-run`: (boolean) Dry run the proposal without sending it to Sphinx's backend.
- `--silent`: (boolean) Silence the output except for error messages. If you specify this flag, you must confirm the proposal by specifying the `--confirm` flag because `--silent` silences the deployment preview.
- `--target-contract <targetContract>`: (string) The name of the contract in the script. Necessary when the script contains multiple contracts.
  - Shorthand: `--tc <targetContract>`

## Examples
1. Propose a deployment on testnets using a script located at `./path/to/script.s.sol`:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --testnets
   ```

2. Dry run a proposal on production networks using a script located at `./path/to/script.s.sol`:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --mainnets --dry-run
   ```

3. Propose a script at `./path/to/script.s.sol` on production networks, skipping the deployment preview:
   ```bash
   npx sphinx propose ./path/to/script.s.sol --mainnets --confirm
   ```
