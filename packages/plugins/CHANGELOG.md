# @chugsplash/plugins

## 0.5.8

### Patch Changes

- c5e2472: Change getChainId call from hardhat-deploy to eth-optimism
- 5e74723: Add support for mappings
- 138f0cd: Small bug fixes for immutable handling
- Updated dependencies [5e74723]
  - @chugsplash/core@0.3.8

## 0.5.7

### Patch Changes

- 6bc37b3: Bump demo and plugins versions

## 0.5.6

### Patch Changes

- dea00dd: Improve error handling for immutable and state variables
- 0d93e7b: Remove reliance on hardhat-deploy for local deployment
- a7c6d18: Add support for foundry-hardhat style artifacts
- 1b88270: Moves predeploy deployment from core to plugins
- Updated dependencies [dea00dd]
- Updated dependencies [3a64b82]
- Updated dependencies [bbe3639]
- Updated dependencies [1b88270]
  - @chugsplash/core@0.3.7

## 0.5.5

### Patch Changes

- 86be8a3: Update versions

## 0.5.4

### Patch Changes

- 8de5829: Add support for signed integer state variables
- 6694fac: Add support for immutables
- 02c7a39: Add support for all immutable types
- 6f53f35: Fix bundle generation bug
- 233f960: Handle errors with immutable variables
- Updated dependencies [8de5829]
- Updated dependencies [02c7a39]
- Updated dependencies [6f53f35]
- Updated dependencies [233f960]
  - @chugsplash/core@0.3.6

## 0.5.3

### Patch Changes

- 6cb309d: Bump versions

## 0.5.2

### Patch Changes

- 3b3ae5a: Separate Hardhat in-process network from localhost to improve testing deployments
- dc88439: Improved error handling in deployment task
- Updated dependencies [3b3ae5a]
- Updated dependencies [dc88439]
  - @chugsplash/core@0.3.5

## 0.5.1

### Patch Changes

- 8ccbe35: Bump plugins and demo packages

## 0.5.0

### Minor Changes

- 123d9c1: Add support for deployments on live networks

### Patch Changes

- Updated dependencies [123d9c1]
  - @chugsplash/contracts@0.3.5
  - @chugsplash/core@0.3.4

## 0.4.4

### Patch Changes

- ded016a: Update demo readme

## 0.4.3

### Patch Changes

- 2c5b238: Support demo
- 2285b39: Replace flaky CloudFlare API for retrieving IPFS files
- Updated dependencies [4ce753b]
- Updated dependencies [2c5b238]
- Updated dependencies [2c5b238]
  - @chugsplash/core@0.3.3
  - @chugsplash/contracts@0.3.3

## 0.4.2

### Patch Changes

- 03d557c: Bump all versions
- Updated dependencies [03d557c]
  - @chugsplash/contracts@0.3.2
  - @chugsplash/core@0.3.2

## 0.4.1

### Patch Changes

- 557e3bd: Bump versions
- Updated dependencies [557e3bd]
- Updated dependencies [cd310fe]
  - @chugsplash/contracts@0.3.1
  - @chugsplash/core@0.3.1

## 0.4.0

### Minor Changes

- 52c7f6c: Bump all packages

### Patch Changes

- Updated dependencies [52c7f6c]
  - @chugsplash/contracts@0.3.0
  - @chugsplash/core@0.3.0

## 0.3.1

### Patch Changes

- f7a4a24: Bump versions of core and plugins packages
- f7a4a24: Bump core and plugins packages
- Updated dependencies [f7a4a24]
- Updated dependencies [f7a4a24]
  - @chugsplash/core@0.2.1

## 0.3.0

### Minor Changes

- 19cf359: Adds local ChugSplash deployments for testing contracts on the Hardhat network.

### Patch Changes

- Updated dependencies [416d41b]
- Updated dependencies [19cf359]
- Updated dependencies [53e1514]
  - @chugsplash/contracts@0.2.0
  - @chugsplash/core@0.2.0

## 0.2.1

### Patch Changes

- dc631e7: Test

## 0.2.0

### Minor Changes

- 04ada98: Adds a hardhat task that shows the live status of an upgrade.

### Patch Changes

- 3a7b19c: Fixes a typo in a variable name (activebundleID => activeBundleID) that was created as a result of an errant find/replace
- Updated dependencies [5109141]
- Updated dependencies [e0db3d0]
- Updated dependencies [efccd1a]
- Updated dependencies [967b529]
- Updated dependencies [e7ee72d]
- Updated dependencies [67c3507]
- Updated dependencies [d7f930f]
- Updated dependencies [3450d6f]
- Updated dependencies [2cc3bc9]
- Updated dependencies [3a7b19c]
- Updated dependencies [da53947]
- Updated dependencies [f92ff76]
- Updated dependencies [04ada98]
- Updated dependencies [2cc3bc9]
  - @chugsplash/contracts@0.2.0
  - @chugsplash/core@0.1.1

## 0.1.2

### Patch Changes

- a6ed94e: Adds Hardhat tasks for creating, listing, and approving ChugSplash projects
- 310dfd9: Adds some nice spinners to hardhat tasks
- a6bc8f6: Makes a few small changes to ChugSplashRegistry (e.g. missing event) and removes leftover ChugSplashManager TS interface vars
- e5fe498: Brings back the ChugSplashManager contract
- Updated dependencies [6403ed2]
- Updated dependencies [e5fe498]
  - @chugsplash/contracts@0.1.1
