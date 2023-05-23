# @chugsplash/plugins

## 0.15.1

### Patch Changes

- f13070f: Use Optimism contracts-bedrock package canary version in all ChugSplash packages
- Updated dependencies [f13070f]
  - @chugsplash/core@0.10.1

## 0.15.0

### Minor Changes

- 6b975e7: Bump contracts dependency version

### Patch Changes

- 1dafc2c: Add support for mapping keys that are contract or enum types
- Updated dependencies [1dafc2c]
- Updated dependencies [6b975e7]
  - @chugsplash/core@0.10.0

## 0.14.1

### Patch Changes

- 8fe018e: Change Hardhat `node` task param from 'silent' to 'hide' due to conflict with existing task

## 0.14.0

### Minor Changes

- 57cd798: Make ChugSplash non-upgradeable
- ac40b0b: Require that proposers are approved by the project owner

### Patch Changes

- 27cb63b: Remove meta upgrade tests
- 1c5e99a: Add support for async config files
- c43c960: Add input validation for config variables
- ea4bc1e: Add a protocol fee to be collected during execution
- 41f420c: Allow function types in contracts
- 06c9af9: Only initialize ChugSplash on local networks
- e2392ad: Update remoteExecution parameter to only be true when proposing on a live network
- c309331: Add organization ID
- b5f5268: Display ChugSplash errors and warnings by default when running Hardhat tests
- fb9442a: Add support for user defined types
- 0ef343d: Write artifacts for proxy and implementation contracts
- 2a0939a: Separate local canonical config files by network
- d652952: Use create3 to deploy non-proxy contracts
- bf1fde7: Add parsing and validation on constructor arugments
- 1d54d12: Add support for flexible constructors and mutable constructor arguments
- dffa427: Fix bug encoding address payable
- 011f0f6: Fix minor bugs when importing OpenZeppelin storage layout
- 992e2fb: Resolve build info files automatically
- 02220c4: Add { gap } keyword
- ff87792: Fix behavior of contracts deployed using Create3
- da576c3: Split UUPS adapter into ownable and access control adapters
- 8eb6686: Add support for other OpenZeppelin storage safety check options
- ae6641d: Add propoer address to bundle proposed event
- b05b489: Replace TODOs with Linear tickets
- 1ba3adc: Make contract execution atomic
- 89c3fe2: Support contract references in constructor arguments
- e797869: Add claimer field to config
- 3d9f9c2: Add support for deploying stateless non-proxied contracts
- f433bc2: Remove claimer from config and registry
- 26ab2ad: Get previous storage layout using OpenZeppelin's format
- 11fd15c: Make chugsplash-deploy task execute locally by default
- ff58a7d: Add support for struct constructor args
- ab983d4: Refactor encoding logic into separate encoding and parsing processes
- be43435: Change proxy ownership transfer tasks to remove ambiguity
- c69aa51: Remove extra CLI tasks
- Updated dependencies [7ee54af]
- Updated dependencies [5896c7c]
- Updated dependencies [1c5e99a]
- Updated dependencies [c43c960]
- Updated dependencies [b8952d1]
- Updated dependencies [ea4bc1e]
- Updated dependencies [1ac2ebd]
- Updated dependencies [49a4934]
- Updated dependencies [41f420c]
- Updated dependencies [ddbea87]
- Updated dependencies [c319493]
- Updated dependencies [28e807d]
- Updated dependencies [06c9af9]
- Updated dependencies [e2392ad]
- Updated dependencies [c309331]
- Updated dependencies [d7dc1ba]
- Updated dependencies [fb9442a]
- Updated dependencies [73277b5]
- Updated dependencies [0ef343d]
- Updated dependencies [491683b]
- Updated dependencies [e5b9f81]
- Updated dependencies [2a0939a]
- Updated dependencies [b7e779f]
- Updated dependencies [d652952]
- Updated dependencies [9fccb34]
- Updated dependencies [a26ab46]
- Updated dependencies [d2f9fae]
- Updated dependencies [ed81039]
- Updated dependencies [bf1fde7]
- Updated dependencies [1d54d12]
- Updated dependencies [dffa427]
- Updated dependencies [f1cf9ac]
- Updated dependencies [992e2fb]
- Updated dependencies [c2712bf]
- Updated dependencies [d540efc]
- Updated dependencies [69dcfba]
- Updated dependencies [57cd798]
- Updated dependencies [fba0fa0]
- Updated dependencies [aa7051a]
- Updated dependencies [b41ec91]
- Updated dependencies [34790fa]
- Updated dependencies [cccb052]
- Updated dependencies [b204c6e]
- Updated dependencies [1eeba58]
- Updated dependencies [02220c4]
- Updated dependencies [ff87792]
- Updated dependencies [3f023b2]
- Updated dependencies [da576c3]
- Updated dependencies [8eb6686]
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
- Updated dependencies [89c3fe2]
- Updated dependencies [e797869]
- Updated dependencies [5e6feaa]
- Updated dependencies [3d9f9c2]
- Updated dependencies [f433bc2]
- Updated dependencies [26ab2ad]
- Updated dependencies [11fd15c]
- Updated dependencies [ac40b0b]
- Updated dependencies [ff58a7d]
- Updated dependencies [1dee798]
- Updated dependencies [ab983d4]
- Updated dependencies [be43435]
- Updated dependencies [c69aa51]
  - @chugsplash/core@0.9.0
  - @chugsplash/contracts@0.7.0

## 0.13.0

### Minor Changes

- 3da5ee8: Add meta upgrades to ChugSplashRegistry

### Patch Changes

- 3e923a0: Change implementation salt and skip deploying implementation if it's already been deployed
- 22c24d2: Add support for parallel execution
- 35c7a63: Add meta upgrades for root ChugSplashManager
- Updated dependencies [3b382d9]
- Updated dependencies [3da5ee8]
- Updated dependencies [ecef09e]
- Updated dependencies [3e923a0]
- Updated dependencies [c76142e]
- Updated dependencies [22c24d2]
- Updated dependencies [35c7a63]
  - @chugsplash/core@0.8.0
  - @chugsplash/contracts@0.6.0
  - @chugsplash/executor@0.8.0

## 0.12.0

### Minor Changes

- 9dca319: Integrate Executor with ChugSplash Managed

### Patch Changes

- 5dcb7d3: Allow user to specify a previous storage layout in their ChugSplash file
- 20f1a7e: Use JSON bundle in contract unit tests
- 80b1a53: Refactor functions that get build info and storage layout
- 736b859: Update contract unit tests to reflect new storage slot segment setter
- Updated dependencies [5dcb7d3]
- Updated dependencies [20f1a7e]
- Updated dependencies [c8af97c]
- Updated dependencies [44e592e]
- Updated dependencies [9dca319]
- Updated dependencies [80b1a53]
- Updated dependencies [6a48dd7]
- Updated dependencies [736b859]
  - @chugsplash/core@0.7.0
  - @chugsplash/contracts@0.5.2
  - @chugsplash/executor@0.7.0

## 0.11.1

### Patch Changes

- d30ebdf: Change the task for displaying bundles into a script
- ca6d384: Bump contracts
- Updated dependencies [ca6d384]
  - @chugsplash/contracts@0.5.1
  - @chugsplash/core@0.6.1
  - @chugsplash/executor@0.6.1

## 0.11.0

### Minor Changes

- fa3f420: Add support for UUPS proxies

### Patch Changes

- 04dba20: Update fund task to optionally automatically calculate the amount of funds to send
- 5c6846e: Remove hard-coded chain id 31337
- 07860e6: Add internal task for displaying bundles
- 5ffd3cc: Fix issue where ChugSplash not initialized when executing locally
- 1a22e72: Make OpenZeppelin proxy addresses consistent in tests
- a9d3337: Fix bug where Hardhat chain ID wasn't being detected on localhost
- Updated dependencies [a76efad]
- Updated dependencies [3b13db4]
- Updated dependencies [04dba20]
- Updated dependencies [5c6846e]
- Updated dependencies [263b34d]
- Updated dependencies [fa3f420]
- Updated dependencies [57a327d]
  - @chugsplash/executor@0.6.0
  - @chugsplash/core@0.6.0
  - @chugsplash/contracts@0.5.0

## 0.10.7

### Patch Changes

- c30b8ef: Fix bug caused by logic that gets the minimum compiler input for a bundle
- Updated dependencies [c30b8ef]
- Updated dependencies [90e5c0b]
  - @chugsplash/core@0.5.6

## 0.10.6

### Patch Changes

- 2caf51e: Change minimum compiler input logic to fix bug that generated incomplete inputs
- Updated dependencies [2caf51e]
  - @chugsplash/executor@0.5.5
  - @chugsplash/core@0.5.5

## 0.10.5

### Patch Changes

- fd98872: Update demo package to reflect latest `getContract` function

## 0.10.4

### Patch Changes

- 4cf40e5: Bump plugins and executor versions
- Updated dependencies [4cf40e5]
  - @chugsplash/executor@0.5.4

## 0.10.3

### Patch Changes

- ecfe984: Bump core and plugins versions
- Updated dependencies [ecfe984]
  - @chugsplash/core@0.5.3

## 0.10.2

### Patch Changes

- 94d65b9: Bump plugins package version

## 0.10.1

### Patch Changes

- e07b90c: Allow user to explicitly define proxy type in ChugSplash file
- Updated dependencies [4265ae4]
- Updated dependencies [4554d0c]
- Updated dependencies [591e7da]
- Updated dependencies [e56b684]
- Updated dependencies [a892f24]
- Updated dependencies [fd70a56]
  - @chugsplash/contracts@0.4.3
  - @chugsplash/core@0.5.1

## 0.10.0

### Minor Changes

- b47a7e5: Merge in ChugSplash Foundry Library
- 120327d: Small updates to artifacts functions exposed by the hardhat plugin.

### Patch Changes

- 4029daf: Change `target` to `referenceName` everywhere
- ed17785: Removes a hack for a bug that was fixed in upstream BaseServiceV2.
- Updated dependencies [8c88808]
- Updated dependencies [fdb9e62]
- Updated dependencies [dfa0381]
- Updated dependencies [1b08f02]
- Updated dependencies [ed17785]
- Updated dependencies [4029daf]
- Updated dependencies [a37d5c3]
- Updated dependencies [b343641]
  - @chugsplash/core@0.5.0
  - @chugsplash/executor@0.5.3
  - @chugsplash/contracts@0.4.2

## 0.9.0

### Minor Changes

- 8df582d: Fix(pg): Refactor tasks to remove dependencies on hardhat
- 0443459: Support custom transparent proxies

### Patch Changes

- 242c7ca: Skip funding deployment if sufficient funds have already been deposited
- 1cbd07b: Set `strictNullChecks` to true for TypeScript
- c379fb6: Use artifact paths object instead of inferring artifacts
- 60d7adc: Make executors permissioned
- f14cc8d: Add flag that allows users to skip the storage slot checker
- 8df582d: Feat(core): Add support for local analytics
- deca63d: Use `getNetwork` to retrieve network name
- 89fd479: Add a '--no-withdraw' flag to the deploy task
- 40f0d0a: Add OpenZeppelin storage slot checker
- 2201f3a: Use `resolveNetworkName` everywhere
- Updated dependencies [ad46bbc]
- Updated dependencies [9edf09b]
- Updated dependencies [042541b]
- Updated dependencies [c8664a2]
- Updated dependencies [57a367d]
- Updated dependencies [1cbd07b]
- Updated dependencies [c379fb6]
- Updated dependencies [ba517ad]
- Updated dependencies [2e41b30]
- Updated dependencies [60d7adc]
- Updated dependencies [f14cc8d]
- Updated dependencies [8df582d]
- Updated dependencies [deca63d]
- Updated dependencies [cb3a70d]
- Updated dependencies [d481925]
- Updated dependencies [2b8af04]
- Updated dependencies [6c07d41]
- Updated dependencies [8df582d]
- Updated dependencies [0443459]
- Updated dependencies [40f0d0a]
- Updated dependencies [2201f3a]
  - @chugsplash/core@0.4.0
  - @chugsplash/executor@0.5.0
  - @chugsplash/contracts@0.4.0

## 0.8.9

### Patch Changes

- 2267ec4: Bump versions
- Updated dependencies [2267ec4]
  - @chugsplash/contracts@0.3.17
  - @chugsplash/core@0.3.24
  - @chugsplash/executor@0.4.14

## 0.8.8

### Patch Changes

- b70b268: Fix chugsplash-init bug where task attempted to copy from non-existent file
- ea1b6d4: Make '@nomiclabs/hardhat-ethers' a dependency instead of devDependency

## 0.8.7

### Patch Changes

- d6984ec: Override transaction gas prices to use EIP-1559 if supported by the network
- Updated dependencies [7cd5e1b]
- Updated dependencies [d6984ec]
- Updated dependencies [532d586]
  - @chugsplash/executor@0.4.13
  - @chugsplash/core@0.3.23

## 0.8.6

### Patch Changes

- 9212fae: Compile files without first cleaning the artifacts directory
- 1cb43e7: Fix Etherscan bug that was caused by an incorrect calculation of implementation addresses
- a60020a: Remove Infura as RPC URL service
- 64e57d6: Better support for deploying containerized executor with Terraform
- Updated dependencies [10f3054]
- Updated dependencies [1cb43e7]
- Updated dependencies [acfe88d]
- Updated dependencies [fdf512b]
- Updated dependencies [88e9465]
- Updated dependencies [a60020a]
- Updated dependencies [64e57d6]
  - @chugsplash/contracts@0.3.16
  - @chugsplash/core@0.3.22
  - @chugsplash/executor@0.4.12

## 0.8.5

### Patch Changes

- a3664d7: Add SimpleStorage contract to plugins
- bb241f5: Update tutorial to use UserChugSplashConfig
- d843707: Expand test coverage to include contract references
- baf3ac1: Changes contract reference syntax from '!Ref' to '{{ }}'
- 89cd352: feat(core): support bytes/strings (length >31)
- dba31f7: Write canonical config to file system when using executing bundles locally
- 4c04d0a: Add chugsplash-init Hardhat task
- c9eeb47: Make configPath a normal parameter on all tasks
- Updated dependencies [74a61c0]
- Updated dependencies [2dbf187]
- Updated dependencies [3ec7a05]
- Updated dependencies [baf3ac1]
- Updated dependencies [89cd352]
- Updated dependencies [dba31f7]
- Updated dependencies [c9eeb47]
  - @chugsplash/contracts@0.3.15
  - @chugsplash/core@0.3.21
  - @chugsplash/executor@0.4.11

## 0.8.4

### Patch Changes

- ad6a5be: Update plugins README and demo
- d5872d5: Fix uninitialized executor bug
- 921f917: Improved logs for funding and post-execution actions
- 693ca0f: Removed hard-coded proxy address
- ba24573: Add list-proposers and add-proposers tasks
- 2182a3c: Add transfer and claim ownership tasks
- 4b8d25d: Fixes several bugs in the format of the generated artifact files
- Updated dependencies [c5cf649]
- Updated dependencies [3f6cabd]
- Updated dependencies [921f917]
- Updated dependencies [d8554c0]
- Updated dependencies [780a395]
- Updated dependencies [335dfc7]
- Updated dependencies [ba24573]
- Updated dependencies [276d5ea]
  - @chugsplash/contracts@0.3.14
  - @chugsplash/core@0.3.20
  - @chugsplash/executor@0.4.10

## 0.8.3

### Patch Changes

- 52d0556: Change the ContractConfig's "address" field to "proxy"
- 38c62b5: Refactor functions that check if an address is a contract
- e7ae731: Improve execution cost estimation
- Updated dependencies [52d0556]
- Updated dependencies [7047b9d]
- Updated dependencies [65bc432]
- Updated dependencies [b55ab15]
- Updated dependencies [38c62b5]
- Updated dependencies [e7ae731]
- Updated dependencies [2652df5]
  - @chugsplash/core@0.3.19
  - @chugsplash/executor@0.4.9
  - @chugsplash/contracts@0.3.13

## 0.8.2

### Patch Changes

- e105ea9: Updates Hardhat tasks to reflect proposer/owner requirement
- Updated dependencies [40c7bfb]
- Updated dependencies [e105ea9]
  - @chugsplash/contracts@0.3.12
  - @chugsplash/core@0.3.18

## 0.8.1

### Patch Changes

- d7fff20: Several improvements / bug fixes discovered when deploying on Optimism's devnet.
- 4eef7fb: Changed the deployment folder name to match hardhat-deploy
- 7e8dd1e: Removes the projectOwner from the ChugSplash config
- f62dfea: Modify chugsplash-cancel so that it does not retrieve the bundle ID before cancelling
- bd87e8c: Filter empty ChugSplash configs in `getContract`
- d12922d: Remove 'silent' flag from the chugsplash-cancel task
- Updated dependencies [d7fff20]
- Updated dependencies [b1850ad]
- Updated dependencies [7e8dd1e]
- Updated dependencies [e1dc2ec]
- Updated dependencies [da79232]
  - @chugsplash/contracts@0.3.11
  - @chugsplash/core@0.3.17
  - @chugsplash/executor@0.4.8

## 0.8.0

### Minor Changes

- ee3ae13: Use executor automatically when deploying against local networks

### Patch Changes

- af5e5ca: Expands storage variable test coverage
- 74da4d0: Simplify storage slot encoding logic
- 7a1737e: Separate config type into UserChugSplashConfig and ParsedChugSplashConfig
- eba1399: Remove the test-remote-execution task
- e757d65: Throw an error if user attempts to fund a project that hasn't been registered
- c32f23e: Add basic support for upgrades
- fd5177e: Add chugsplash-list-projects Hardhat task
- 0b52005: Remove redundant Proxy verification attempts. Link ChugSplashManager proxy with its implementation on Etherscan.
- e1af6e3: Merge deploy and upgrade tasks
- 3572abd: Batch SetStorage actions into large transactions to speed up execution
- ec87d11: Fixes bug where signed integers were encoded as unsigned integers
- ae89911: Add user logs for the commit subtask
- f1e6f8c: Disable ChugSplash by default in the Hardhat "run" task
- c5ec8e4: Replace incorrect use of the `getDefaultProxyAddress` function
- bde3888: Improve the hardhat node task
- ee3ae13: Remove HRE dependency from execution logic and move to core package
- 4b67dc0: Expands test coverage to support dynamic arrays
- 42b6c89: Fixes a bug where the BaseServiceV2 was erroring when parsing command line args from the Hardhat plugin
- 9e48bbf: Support upgrades with the hardhat test command
- 0c30af0: Commit only the necessary input sources to IPFS.
- baee529: Deploy the executor only once per CLI command
- 6276a86: Move `checkValidDeployment` to the core package
- fb1168f: Make executor most robust to errors and cancelled bundles. Ensure that executor receives payment.
- 6a2644e: Fix long error messages truncating
- 8e5507d: Improve logs in hardhat tasks
- 3507e4b: Add a chugsplash-withdraw task to withdraw project owner funds from projects
- fc8cfd3: Remove progress bar in execution-related Hardhat tasks
- f217221: Use the executor to deploy and verify the ChugSplash predeployed contracts
- 8478b24: Add a chugsplash-cancel Hardhat task to cancel active bundles
- 05a7bb4: Add noCompile flag to relevant Hardhat tasks
- a1ae30f: Make language in the user logs neutral to deployments/upgrades.
- da5cb35: Move the logic that initializes the ChugSplash predeploys into the executor.
- 5406b7b: Update canonical ChugSplash config type usage
- Updated dependencies [74da4d0]
- Updated dependencies [7a1737e]
- Updated dependencies [d458d93]
- Updated dependencies [6f83489]
- Updated dependencies [c32f23e]
- Updated dependencies [16348b2]
- Updated dependencies [fd5177e]
- Updated dependencies [0b52005]
- Updated dependencies [e1af6e3]
- Updated dependencies [3572abd]
- Updated dependencies [ec87d11]
- Updated dependencies [c5ec8e4]
- Updated dependencies [9ebc63c]
- Updated dependencies [ee3ae13]
- Updated dependencies [9be91c3]
- Updated dependencies [0c30af0]
- Updated dependencies [6276a86]
- Updated dependencies [fb1168f]
- Updated dependencies [6a2644e]
- Updated dependencies [64463f1]
- Updated dependencies [fc8cfd3]
- Updated dependencies [f217221]
- Updated dependencies [780e54f]
- Updated dependencies [ec41164]
- Updated dependencies [da5cb35]
- Updated dependencies [5406b7b]
  - @chugsplash/core@0.3.16
  - @chugsplash/executor@0.4.7
  - @chugsplash/contracts@0.3.10

## 0.7.0

### Minor Changes

- 3d1ca28: Add Hardhat task to explicitly fund deployments
- cf7751d: Add chugsplash-status Hardhat task to monitor remote deployments

### Patch Changes

- ac04198: Improve error handling in chugsplash-approve task
- 162cfb7: Fix bug parsing build info metadata
- 7c367b4: Updates the chugsplash-execute task
- 457b19a: Improve chugsplash-deploy hardhat task
- Updated dependencies [ed7babc]
- Updated dependencies [457b19a]
  - @chugsplash/contracts@0.3.9
  - @chugsplash/core@0.3.15

## 0.6.0

### Minor Changes

- 8323afb: Add deployment artifact generation on the user's side

### Patch Changes

- Updated dependencies [8323afb]
  - @chugsplash/core@0.3.14

## 0.5.14

### Patch Changes

- 15ebe78: Hardhat task bug fixes and improvements
- Updated dependencies [15ebe78]
  - @chugsplash/core@0.3.13

## 0.5.13

### Patch Changes

- b653177: Remove parallel deployments due to bug on live networks

## 0.5.12

### Patch Changes

- ecafe45: Refactor chugsplash-commit and chugsplash-load subtasks
- d0a9f15: Update plugins README
- 34078c6: Add a script that publishes local deployments to IPFS
- e862925: Remove local flag
- a43e0e3: Add Docker configuration for executor
- 12a7f34: Improve execution speed with parallelization
- Updated dependencies [ecafe45]
  - @chugsplash/core@0.3.12

## 0.5.11

### Patch Changes

- 3c939bd: Refactor remote bundling logic
- 7b33791: Integrate etherscan verification into executor
- 6941e89: Remove spinner from subtasks. Also update chugsplash-propose task to be more descriptive and robust.
- 9d38797: Update chugsplash-register task to work locally
- Updated dependencies [6a6f0c0]
- Updated dependencies [9d38797]
  - @chugsplash/contracts@0.3.8
  - @chugsplash/core@0.3.11

## 0.5.10

### Patch Changes

- c84eb6c: Update deployment artifacts to be hardhat-deploy compatible
- a50e15b: Filter unnecessary artifacts that were being committed to IPFS
- 5ce19b6: Replace spinner in chugsplash-deploy task due to clash with Hardhat's logs
- 071d867: Implemented minimal standalone executor
- c6485b2: Resolve type issues with chugsplash-execute command
- df9950a: Refactor execution into separate CLI command
- afe99ad: Verify ChugSpash predeploy contracts
- 21df9d7: Add Etherscan verification in executor
- 273d4c3: Use creation bytecode instead of the `DEPLOY_CODE_PREFIX` to deploy implementation contracts for Etherscan compatibility
- 6daea1a: Add artifact generation for deployments
- Updated dependencies [a536675]
- Updated dependencies [21df9d7]
- Updated dependencies [273d4c3]
- Updated dependencies [6daea1a]
- Updated dependencies [c08a950]
- Updated dependencies [78acb9a]
  - @chugsplash/contracts@0.3.7
  - @chugsplash/core@0.3.10

## 0.5.9

### Patch Changes

- 5ad574b: Fixes a bug that would break deterministic deployment on non-hardhat networks
- Updated dependencies [062a439]
  - @chugsplash/core@0.3.9

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
