# @chugsplash/core

## 0.10.1

### Patch Changes

- f13070f: Use Optimism contracts-bedrock package canary version in all ChugSplash packages

## 0.10.0

### Minor Changes

- 6b975e7: Bump contracts dependency version

### Patch Changes

- 1dafc2c: Add support for mapping keys that are contract or enum types

## 0.9.0

### Minor Changes

- c319493: Deploy contracts before modifying proxies during execution
- c309331: Add organization ID
- 57cd798: Make ChugSplash non-upgradeable
- e797869: Add claimer field to config
- 11fd15c: Make chugsplash-deploy task execute locally by default
- ac40b0b: Require that proposers are approved by the project owner

### Patch Changes

- 7ee54af: Assert that the block gas limit is at least 15 million
- 5896c7c: Remove unused `getMinimumSourceNames` function
- 1c5e99a: Add support for async config files
- c43c960: Add input validation for config variables
- ea4bc1e: Add a protocol fee to be collected during execution
- 41f420c: Allow function types in contracts
- 06c9af9: Only initialize ChugSplash on local networks
- e2392ad: Update remoteExecution parameter to only be true when proposing on a live network
- d7dc1ba: Resolve inherited private variable conflicts
- fb9442a: Add support for user defined types
- 0ef343d: Write artifacts for proxy and implementation contracts
- e5b9f81: Add ChugSplashClaimer which will exist on L1
- 2a0939a: Separate local canonical config files by network
- b7e779f: Assert that the contracts in the config are below the contract size limit
- d652952: Use create3 to deploy non-proxy contracts
- 9fccb34: Merge execution functions in the ChugSplashManager
- a26ab46: Validate usage of the preserve keyword
- ed81039: Assert block gas limit is sufficiently high in parsing logic
- bf1fde7: Add parsing and validation on constructor arugments
- 1d54d12: Add support for flexible constructors and mutable constructor arguments
- dffa427: Fix bug encoding address payable
- f1cf9ac: Fix bug parsing proxied config variables
- c2712bf: Allow executor to withdraw specified amount of debt
- d540efc: Change documentation for mapping value label
- 69dcfba: Add support for opt-in manager upgrades
- fba0fa0: Add `isDataHexString` helper function
- cccb052: Ensure storageLayout field is never undefined
- b204c6e: Allow bundles to be proposed after being completed or cancelled
- 1eeba58: Assert valid bundle size
- 02220c4: Add { gap } keyword
- ff87792: Fix behavior of contracts deployed using Create3
- 3f023b2: Restrict Solidity versions to >0.5.x
- da576c3: Split UUPS adapter into ownable and access control adapters
- 8eb6686: Add support for other OpenZeppelin storage safety check options
- f72b185: Use general Create2 contract
- 99ef1a7: Allow configurable system owner
- b05b489: Replace TODOs with Linear tickets
- 1ba3adc: Make contract execution atomic
- 89c3fe2: Support contract references in constructor arguments
- 3d9f9c2: Add support for deploying stateless non-proxied contracts
- f433bc2: Remove claimer from config and registry
- 26ab2ad: Get previous storage layout using OpenZeppelin's format
- ff58a7d: Add support for struct constructor args
- 1dee798: Fixes a couple errors when deploying no-proxy contracts
- ab983d4: Refactor encoding logic into separate encoding and parsing processes
- be43435: Change proxy ownership transfer tasks to remove ambiguity
- c69aa51: Remove extra CLI tasks
- Updated dependencies [b8952d1]
- Updated dependencies [ea4bc1e]
- Updated dependencies [1ac2ebd]
- Updated dependencies [49a4934]
- Updated dependencies [ddbea87]
- Updated dependencies [c319493]
- Updated dependencies [28e807d]
- Updated dependencies [c309331]
- Updated dependencies [73277b5]
- Updated dependencies [491683b]
- Updated dependencies [e5b9f81]
- Updated dependencies [d652952]
- Updated dependencies [9fccb34]
- Updated dependencies [d2f9fae]
- Updated dependencies [992e2fb]
- Updated dependencies [c2712bf]
- Updated dependencies [69dcfba]
- Updated dependencies [57cd798]
- Updated dependencies [aa7051a]
- Updated dependencies [b41ec91]
- Updated dependencies [34790fa]
- Updated dependencies [b204c6e]
- Updated dependencies [ff87792]
- Updated dependencies [da576c3]
- Updated dependencies [f72b185]
- Updated dependencies [ae6641d]
- Updated dependencies [99ef1a7]
- Updated dependencies [0c045f9]
- Updated dependencies [c87c4a3]
- Updated dependencies [15368e8]
- Updated dependencies [2b9f72c]
- Updated dependencies [b05b489]
- Updated dependencies [1ba3adc]
- Updated dependencies [1c8fc74]
- Updated dependencies [e797869]
- Updated dependencies [5e6feaa]
- Updated dependencies [3d9f9c2]
- Updated dependencies [f433bc2]
- Updated dependencies [11fd15c]
- Updated dependencies [ac40b0b]
  - @chugsplash/contracts@0.7.0

## 0.8.1

### Patch Changes

- 6b3e2ed: Fix Etherscan verification constructor args
- 6b3e2ed: Fix contract verification constructor args

## 0.8.0

### Minor Changes

- 3da5ee8: Add meta upgrades to ChugSplashRegistry

### Patch Changes

- 3b382d9: Remove filesystem calls that were used during debugging
- ecef09e: Improve executor retry policy
- 3e923a0: Change implementation salt and skip deploying implementation if it's already been deployed
- 22c24d2: Add support for parallel execution
- 35c7a63: Add meta upgrades for root ChugSplashManager
- Updated dependencies [3da5ee8]
- Updated dependencies [3e923a0]
- Updated dependencies [c76142e]
- Updated dependencies [35c7a63]
  - @chugsplash/contracts@0.6.0

## 0.7.0

### Minor Changes

- 9dca319: Integrate Executor with ChugSplash Managed

### Patch Changes

- 5dcb7d3: Allow user to specify a previous storage layout in their ChugSplash file
- c8af97c: Update `setStorage` function to set only a segment of a storage slot
- 44e592e: Add the 'preserve' keyword that allows variables to be maintained across upgrades
- 80b1a53: Refactor functions that get build info and storage layout
- 6a48dd7: Remove circular dependencies
- 736b859: Update contract unit tests to reflect new storage slot segment setter
- Updated dependencies [20f1a7e]
- Updated dependencies [c8af97c]
- Updated dependencies [736b859]
  - @chugsplash/contracts@0.5.2

## 0.6.1

### Patch Changes

- ca6d384: Bump contracts
- Updated dependencies [ca6d384]
  - @chugsplash/contracts@0.5.1

## 0.6.0

### Minor Changes

- 3b13db4: Set immutable variables in the ChugSplash file via the 'constructorArgs' field
- fa3f420: Add support for UUPS proxies

### Patch Changes

- 04dba20: Update fund task to optionally automatically calculate the amount of funds to send
- 5c6846e: Remove hard-coded chain id 31337
- 263b34d: Add logic for claiming bundles
- 57a327d: Temporarily allow anyone to propose bundles
- Updated dependencies [263b34d]
- Updated dependencies [fa3f420]
- Updated dependencies [57a327d]
  - @chugsplash/contracts@0.5.0

## 0.5.6

### Patch Changes

- c30b8ef: Fix bug caused by logic that gets the minimum compiler input for a bundle
- 90e5c0b: Move the 'missing storage layout error' from `getStorageLayout` to `getBuildInfo`

## 0.5.5

### Patch Changes

- 2caf51e: Change minimum compiler input logic to fix bug that generated incomplete inputs

## 0.5.4

### Patch Changes

- ca130bd: Bump @eth-optimism-commonts dependency version

## 0.5.3

### Patch Changes

- ecfe984: Bump core and plugins versions

## 0.5.2

### Patch Changes

- f38d444: Bump core package version

## 0.5.1

### Patch Changes

- e56b684: Fix external proxy type validation bug
- a892f24: Slightly change wording in error messages
- fd70a56: Add recommendation to clear contract artifacts if variable not found in storage layout
- Updated dependencies [4265ae4]
- Updated dependencies [4554d0c]
- Updated dependencies [591e7da]
  - @chugsplash/contracts@0.4.3

## 0.5.0

### Minor Changes

- b343641: Small rename, getFinalDeploymentTxnHash => getBundleCompletionTxnHash.

### Patch Changes

- 8c88808: Minor improvement to config error string.
- dfa0381: Throw an error if immutable variable value is defined in both the contract and config file
- 1b08f02: Updates ether formatting strings to four decimals in most places.
- 4029daf: Change `target` to `referenceName` everywhere
- a37d5c3: Add discord link to output
- Updated dependencies [4029daf]
  - @chugsplash/contracts@0.4.2

## 0.4.2

### Patch Changes

- 68c1a56: Remove `initializeChugSplash` call in register and propose task

## 0.4.1

### Patch Changes

- 48088b2: Add timeout on analytics functions

## 0.4.0

### Minor Changes

- 8df582d: Fix(pg): Refactor tasks to remove dependencies on hardhat
- 0443459: Support custom transparent proxies

### Patch Changes

- ad46bbc: Change error messages so that they don't infer network name
- 042541b: Remove unnecessary TODO
- c8664a2: Check if proxy is deployed before transferring to ChugSplash
- 57a367d: Fix issue where executor always tries to execute locally
- 1cbd07b: Set `strictNullChecks` to true for TypeScript
- c379fb6: Use artifact paths object instead of inferring artifacts
- ba517ad: Ensure Array.at() is always supported
- 2e41b30: Fix bug caused by iterating over empty AST node object
- 60d7adc: Make executors permissioned
- f14cc8d: Add flag that allows users to skip the storage slot checker
- 8df582d: Feat(core): Add support for local analytics
- deca63d: Use `getNetwork` to retrieve network name
- cb3a70d: Improve spinner timing
- d481925: Add foundry specific messages
- 2b8af04: Change EIP-1967 proxy implementation getter to be compatible with OpenZeppelin contracts
- 6c07d41: Display contract name instead of fully qualified name in deployment table
- 40f0d0a: Add OpenZeppelin storage slot checker
- 2201f3a: Use `resolveNetworkName` everywhere
- Updated dependencies [60d7adc]
- Updated dependencies [0443459]
- Updated dependencies [40f0d0a]
  - @chugsplash/contracts@0.4.0

## 0.3.24

### Patch Changes

- 2267ec4: Bump versions
- Updated dependencies [2267ec4]
  - @chugsplash/contracts@0.3.17

## 0.3.23

### Patch Changes

- d6984ec: Override transaction gas prices to use EIP-1559 if supported by the network

## 0.3.22

### Patch Changes

- 1cb43e7: Fix Etherscan bug that was caused by an incorrect calculation of implementation addresses
- acfe88d: Improve execution cost estimation
- fdf512b: Adds a universal salt that makes it easy to deploy new versions of the ChugSplash contracts
- Updated dependencies [10f3054]
- Updated dependencies [fdf512b]
- Updated dependencies [88e9465]
- Updated dependencies [a60020a]
  - @chugsplash/contracts@0.3.16

## 0.3.21

### Patch Changes

- 74a61c0: Change deployment process so that ChugSplash addresses are calculated based on multisig address
- baf3ac1: Changes contract reference syntax from '!Ref' to '{{ }}'
- 89cd352: feat(core): support bytes/strings (length >31)
- dba31f7: Write canonical config to file system when using executing bundles locally
- c9eeb47: Make configPath a normal parameter on all tasks
- Updated dependencies [74a61c0]
- Updated dependencies [3ec7a05]
  - @chugsplash/contracts@0.3.15

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
