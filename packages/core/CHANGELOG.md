# @chugsplash/core

## 0.3.14

### Patch Changes

- 8323afb: Add deployment artifact generation on the user's side

## 0.3.13

### Patch Changes

- 15ebe78: Hardhat task bug fixes and improvements

## 0.3.12

### Patch Changes

- ecafe45: Refactor chugsplash-commit and chugsplash-load subtasks

## 0.3.11

### Patch Changes

- 9d38797: Update chugsplash-register task to work locally
- Updated dependencies [6a6f0c0]
  - @chugsplash/contracts@0.3.8

## 0.3.10

### Patch Changes

- 21df9d7: Add Etherscan verification in executor
- 273d4c3: Use creation bytecode instead of the `DEPLOY_CODE_PREFIX` to deploy implementation contracts for Etherscan compatibility
- 6daea1a: Add artifact generation for deployments
- Updated dependencies [a536675]
- Updated dependencies [273d4c3]
- Updated dependencies [c08a950]
- Updated dependencies [78acb9a]
  - @chugsplash/contracts@0.3.7

## 0.3.9

### Patch Changes

- 062a439: Add log function that is optionally hidden

## 0.3.8

### Patch Changes

- 5e74723: Add support for mappings

## 0.3.7

### Patch Changes

- dea00dd: Improve error handling for immutable and state variables
- 3a64b82: Add support for arrays of fixed length
- bbe3639: Error handling in core package
- 1b88270: Moves predeploy deployment from core to plugins

## 0.3.6

### Patch Changes

- 8de5829: Add support for signed integer state variables
- 02c7a39: Add support for all immutable types
- 6f53f35: Fix bundle generation bug
- 233f960: Handle errors with immutable variables

## 0.3.5

### Patch Changes

- 3b3ae5a: Separate Hardhat in-process network from localhost to improve testing deployments
- dc88439: Improved error handling in deployment task

## 0.3.4

### Patch Changes

- 123d9c1: Add support for deployments on live networks
- Updated dependencies [123d9c1]
  - @chugsplash/contracts@0.3.5

## 0.3.3

### Patch Changes

- 4ce753b: Add function that checks if a ChugSplash config file is empty
- 2c5b238: Change config file names
- 2c5b238: Support demo
- Updated dependencies [2c5b238]
  - @chugsplash/contracts@0.3.3

## 0.3.2

### Patch Changes

- 03d557c: Bump all versions
- Updated dependencies [03d557c]
  - @chugsplash/contracts@0.3.2

## 0.3.1

### Patch Changes

- 557e3bd: Bump versions
- Updated dependencies [557e3bd]
- Updated dependencies [cd310fe]
  - @chugsplash/contracts@0.3.1

## 0.3.0

### Minor Changes

- 52c7f6c: Bump all packages

### Patch Changes

- Updated dependencies [52c7f6c]
  - @chugsplash/contracts@0.3.0

## 0.2.1

### Patch Changes

- f7a4a24: Bump versions of core and plugins packages
- f7a4a24: Bump core and plugins packages

## 0.2.0

### Minor Changes

- 19cf359: Adds local ChugSplash deployments for testing contracts on the Hardhat network.

### Patch Changes

- Updated dependencies [416d41b]
- Updated dependencies [19cf359]
- Updated dependencies [53e1514]
  - @chugsplash/contracts@0.2.0

## 0.1.1

### Patch Changes

- 04ada98: Adds a hardhat task that shows the live status of an upgrade.
