# @chugsplash/core

## 0.3.20

### Patch Changes

- 3f6cabd: Smarter management of batched action execution
- 921f917: Improved logs for funding and post-execution actions
- d8554c0: Prefix logs with [ChugSplash]
- 780a395: Standardize logger messages
- 335dfc7: Adds more logs to the ChugSplash setup process in the executor
- ba24573: Add list-proposers and add-proposers tasks
- 276d5ea: Adds function comments to several type checking functions
- Updated dependencies [c5cf649]
  - @chugsplash/contracts@0.3.14

## 0.3.19

### Patch Changes

- 52d0556: Change the ContractConfig's "address" field to "proxy"
- 65bc432: Execution gas cost estimation bug fixes
- 38c62b5: Refactor functions that check if an address is a contract
- e7ae731: Improve execution cost estimation
- 2652df5: Fixes circular dependency issue caused by `isContractDeployed`
- Updated dependencies [7047b9d]
- Updated dependencies [b55ab15]
  - @chugsplash/contracts@0.3.13

## 0.3.18

### Patch Changes

- e105ea9: Updates Hardhat tasks to reflect proposer/owner requirement
- Updated dependencies [40c7bfb]
  - @chugsplash/contracts@0.3.12

## 0.3.17

### Patch Changes

- d7fff20: Several improvements / bug fixes discovered when deploying on Optimism's devnet.
- 7e8dd1e: Removes the projectOwner from the ChugSplash config
- Updated dependencies [d7fff20]
- Updated dependencies [b1850ad]
- Updated dependencies [e1dc2ec]
- Updated dependencies [da79232]
  - @chugsplash/contracts@0.3.11

## 0.3.16

### Patch Changes

- 74da4d0: Simplify storage slot encoding logic
- 7a1737e: Separate config type into UserChugSplashConfig and ParsedChugSplashConfig
- c32f23e: Add basic support for upgrades
- 16348b2: Make the ChugSplashRegistry proxy's address deterministic
- fd5177e: Add chugsplash-list-projects Hardhat task
- e1af6e3: Merge deploy and upgrade tasks
- 3572abd: Batch SetStorage actions into large transactions to speed up execution
- ec87d11: Fixes bug where signed integers were encoded as unsigned integers
- c5ec8e4: Replace incorrect use of the `getDefaultProxyAddress` function
- 9ebc63c: Adds support for dynamic arrays
- ee3ae13: Remove HRE dependency from execution logic and move to core package
- 0c30af0: Commit only the necessary input sources to IPFS.
- 6276a86: Move `checkValidDeployment` to the core package
- fb1168f: Make executor most robust to errors and cancelled bundles. Ensure that executor receives payment.
- 6a2644e: Fix long error messages truncating
- 64463f1: Change storageEntries to be the correct type
- fc8cfd3: Remove progress bar in execution-related Hardhat tasks
- f217221: Use the executor to deploy and verify the ChugSplash predeployed contracts
- 780e54f: Submit the minimum compiler input necessary to verify contracts on Etherscan
- ec41164: Remove console.log
- da5cb35: Move the logic that initializes the ChugSplash predeploys into the executor.
- 5406b7b: Update canonical ChugSplash config type usage
- Updated dependencies [6f83489]
- Updated dependencies [16348b2]
- Updated dependencies [9be91c3]
  - @chugsplash/contracts@0.3.10

## 0.3.15

### Patch Changes

- 457b19a: Improve chugsplash-deploy hardhat task
- Updated dependencies [ed7babc]
  - @chugsplash/contracts@0.3.9

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
