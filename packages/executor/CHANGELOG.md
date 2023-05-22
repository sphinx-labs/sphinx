# @chugsplash/executor

## 0.10.0

### Minor Changes

- 6b975e7: Bump contracts dependency version

### Patch Changes

- Updated dependencies [1dafc2c]
- Updated dependencies [6b975e7]
  - @chugsplash/plugins@0.15.0
  - @chugsplash/core@0.10.0

## 0.9.0

### Minor Changes

- c319493: Deploy contracts before modifying proxies during execution
- 57cd798: Make ChugSplash non-upgradeable

### Patch Changes

- 06c9af9: Only initialize ChugSplash on local networks
- af346c9: Catch error during remote execution
- c309331: Add organization ID
- da576c3: Split UUPS adapter into ownable and access control adapters
- 99ef1a7: Allow configurable system owner
- b05b489: Replace TODOs with Linear tickets
- 1ba3adc: Make contract execution atomic
- e797869: Add claimer field to config
- 821e9fd: Deploy and verify reference DefaultProxy and ChugSplashManagerProxy contracts
- 3d9f9c2: Add support for deploying stateless non-proxied contracts
- f433bc2: Remove claimer from config and registry
- 26ab2ad: Get previous storage layout using OpenZeppelin's format
- 11fd15c: Make chugsplash-deploy task execute locally by default
- Updated dependencies [7ee54af]
- Updated dependencies [5896c7c]
- Updated dependencies [27cb63b]
- Updated dependencies [1c5e99a]
- Updated dependencies [c43c960]
- Updated dependencies [ea4bc1e]
- Updated dependencies [41f420c]
- Updated dependencies [c319493]
- Updated dependencies [06c9af9]
- Updated dependencies [e2392ad]
- Updated dependencies [c309331]
- Updated dependencies [b5f5268]
- Updated dependencies [d7dc1ba]
- Updated dependencies [fb9442a]
- Updated dependencies [0ef343d]
- Updated dependencies [e5b9f81]
- Updated dependencies [2a0939a]
- Updated dependencies [b7e779f]
- Updated dependencies [d652952]
- Updated dependencies [9fccb34]
- Updated dependencies [a26ab46]
- Updated dependencies [ed81039]
- Updated dependencies [bf1fde7]
- Updated dependencies [1d54d12]
- Updated dependencies [dffa427]
- Updated dependencies [011f0f6]
- Updated dependencies [f1cf9ac]
- Updated dependencies [992e2fb]
- Updated dependencies [c2712bf]
- Updated dependencies [d540efc]
- Updated dependencies [69dcfba]
- Updated dependencies [57cd798]
- Updated dependencies [fba0fa0]
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
- Updated dependencies [b05b489]
- Updated dependencies [1ba3adc]
- Updated dependencies [89c3fe2]
- Updated dependencies [e797869]
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
  - @chugsplash/plugins@0.14.0

## 0.8.1

### Patch Changes

- 6b3e2ed: Fix Etherscan verification constructor args
- 6b3e2ed: Fix contract verification constructor args
- Updated dependencies [6b3e2ed]
- Updated dependencies [6b3e2ed]
  - @chugsplash/core@0.8.1

## 0.8.0

### Minor Changes

- 3da5ee8: Add meta upgrades to ChugSplashRegistry

### Patch Changes

- ecef09e: Improve executor retry policy
- 3e923a0: Change implementation salt and skip deploying implementation if it's already been deployed
- 22c24d2: Add support for parallel execution
- Updated dependencies [3b382d9]
- Updated dependencies [3da5ee8]
- Updated dependencies [ecef09e]
- Updated dependencies [3e923a0]
- Updated dependencies [22c24d2]
- Updated dependencies [35c7a63]
  - @chugsplash/core@0.8.0

## 0.7.0

### Minor Changes

- 9dca319: Integrate Executor with ChugSplash Managed

### Patch Changes

- Updated dependencies [5dcb7d3]
- Updated dependencies [c8af97c]
- Updated dependencies [44e592e]
- Updated dependencies [9dca319]
- Updated dependencies [80b1a53]
- Updated dependencies [6a48dd7]
- Updated dependencies [736b859]
  - @chugsplash/core@0.7.0

## 0.6.1

### Patch Changes

- ca6d384: Bump contracts
- Updated dependencies [ca6d384]
  - @chugsplash/core@0.6.1

## 0.6.0

### Minor Changes

- fa3f420: Add support for UUPS proxies

### Patch Changes

- a76efad: Removes an unnecessary environment variable in the ChugSplashExecutor.
- 263b34d: Add logic for claiming bundles
- Updated dependencies [3b13db4]
- Updated dependencies [04dba20]
- Updated dependencies [5c6846e]
- Updated dependencies [263b34d]
- Updated dependencies [fa3f420]
- Updated dependencies [57a327d]
  - @chugsplash/core@0.6.0

## 0.5.5

### Patch Changes

- 2caf51e: Change minimum compiler input logic to fix bug that generated incomplete inputs
- Updated dependencies [2caf51e]
  - @chugsplash/core@0.5.5

## 0.5.4

### Patch Changes

- 4cf40e5: Bump plugins and executor versions

## 0.5.3

### Patch Changes

- fdb9e62: Set executor default port
- ed17785: Updates the executor to use the latest version of BaseServiceV2.
- Updated dependencies [8c88808]
- Updated dependencies [dfa0381]
- Updated dependencies [1b08f02]
- Updated dependencies [4029daf]
- Updated dependencies [a37d5c3]
- Updated dependencies [b343641]
  - @chugsplash/core@0.5.0

## 0.5.2

### Patch Changes

- 5a135ec: Fix issue verifying ChugSplash contracts

## 0.5.1

### Patch Changes

- 48088b2: Add timeout on analytics functions
- Updated dependencies [48088b2]
  - @chugsplash/core@0.4.1

## 0.5.0

### Minor Changes

- 8df582d: Fix(pg): Refactor tasks to remove dependencies on hardhat

### Patch Changes

- 9edf09b: Fix bug where executor wasn't detecting old approvals
- 57a367d: Fix issue where executor always tries to execute locally
- 1cbd07b: Set `strictNullChecks` to true for TypeScript
- c379fb6: Use artifact paths object instead of inferring artifacts
- 60d7adc: Make executors permissioned
- 8df582d: Feat(core): Add support for local analytics
- 40f0d0a: Add OpenZeppelin storage slot checker
- Updated dependencies [ad46bbc]
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

## 0.4.14

### Patch Changes

- 2267ec4: Bump versions
- Updated dependencies [2267ec4]
  - @chugsplash/core@0.3.24

## 0.4.13

### Patch Changes

- 7cd5e1b: Add blockchain network parameter to execution event
- d6984ec: Override transaction gas prices to use EIP-1559 if supported by the network
- 532d586: Support defining executor port with environment variable
- Updated dependencies [d6984ec]
  - @chugsplash/core@0.3.23

## 0.4.12

### Patch Changes

- 1cb43e7: Fix Etherscan bug that was caused by an incorrect calculation of implementation addresses
- a60020a: Remove Infura as RPC URL service
- 64e57d6: Better support for deploying containerized executor with Terraform
- Updated dependencies [1cb43e7]
- Updated dependencies [acfe88d]
- Updated dependencies [fdf512b]
  - @chugsplash/core@0.3.22

## 0.4.11

### Patch Changes

- 74a61c0: Change deployment process so that ChugSplash addresses are calculated based on multisig address
- 2dbf187: Change @nomiclabs/hardhat-etherscan from devDependency to dependency
- dba31f7: Write canonical config to file system when using executing bundles locally
- Updated dependencies [74a61c0]
- Updated dependencies [baf3ac1]
- Updated dependencies [89cd352]
- Updated dependencies [dba31f7]
- Updated dependencies [c9eeb47]
  - @chugsplash/core@0.3.21

## 0.4.10

### Patch Changes

- 921f917: Improved logs for funding and post-execution actions
- d8554c0: Prefix logs with [ChugSplash]
- 780a395: Standardize logger messages
- 335dfc7: Adds more logs to the ChugSplash setup process in the executor
- Updated dependencies [3f6cabd]
- Updated dependencies [921f917]
- Updated dependencies [d8554c0]
- Updated dependencies [780a395]
- Updated dependencies [335dfc7]
- Updated dependencies [ba24573]
- Updated dependencies [276d5ea]
  - @chugsplash/core@0.3.20

## 0.4.9

### Patch Changes

- 52d0556: Change the ContractConfig's "address" field to "proxy"
- 65bc432: Execution gas cost estimation bug fixes
- e7ae731: Improve execution cost estimation
- Updated dependencies [52d0556]
- Updated dependencies [65bc432]
- Updated dependencies [38c62b5]
- Updated dependencies [e7ae731]
- Updated dependencies [2652df5]
  - @chugsplash/core@0.3.19

## 0.4.8

### Patch Changes

- d7fff20: Several improvements / bug fixes discovered when deploying on Optimism's devnet.
- 7e8dd1e: Removes the projectOwner from the ChugSplash config
- Updated dependencies [d7fff20]
- Updated dependencies [7e8dd1e]
  - @chugsplash/core@0.3.17

## 0.4.7

### Patch Changes

- d458d93: Wrap Etherscan verification attempts in try/catch blocks
- 16348b2: Make the ChugSplashRegistry proxy's address deterministic
- 0b52005: Remove redundant Proxy verification attempts. Link ChugSplashManager proxy with its implementation on Etherscan.
- c5ec8e4: Replace incorrect use of the `getDefaultProxyAddress` function
- ee3ae13: Remove HRE dependency from execution logic and move to core package
- fb1168f: Make executor most robust to errors and cancelled bundles. Ensure that executor receives payment.
- f217221: Use the executor to deploy and verify the ChugSplash predeployed contracts
- 780e54f: Submit the minimum compiler input necessary to verify contracts on Etherscan
- da5cb35: Move the logic that initializes the ChugSplash predeploys into the executor.
- 5406b7b: Update canonical ChugSplash config type usage
- Updated dependencies [74da4d0]
- Updated dependencies [7a1737e]
- Updated dependencies [c32f23e]
- Updated dependencies [16348b2]
- Updated dependencies [fd5177e]
- Updated dependencies [e1af6e3]
- Updated dependencies [3572abd]
- Updated dependencies [ec87d11]
- Updated dependencies [c5ec8e4]
- Updated dependencies [9ebc63c]
- Updated dependencies [ee3ae13]
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

## 0.4.6

### Patch Changes

- 7c367b4: Updates the chugsplash-execute task

## 0.4.5

### Patch Changes

- 8323afb: Add deployment artifact generation on the user's side

## 0.4.4

### Patch Changes

- 15ebe78: Hardhat task bug fixes and improvements

## 0.4.3

### Patch Changes

- b653177: Remove parallel deployments due to bug on live networks

## 0.4.2

### Patch Changes

- 61f8ca1: Use environment variable `HARDHAT_NETWORK` to determine executor's network
- f199dff: Verify proxy as part of ChugSplash config verification
- a43e0e3: Add Docker configuration for executor
- 12a7f34: Improve execution speed with parallelization
- 07a32f6: Run the executor using the HRE executable

## 0.4.1

### Patch Changes

- 7b33791: Integrate etherscan verification into executor

## 0.4.0

### Minor Changes

- 21df9d7: Add Etherscan verification in executor

### Patch Changes

- 071d867: Implemented minimal standalone executor
- afe99ad: Verify ChugSpash predeploy contracts

## 0.3.2

### Patch Changes

- 03d557c: Bump all versions

## 0.3.1

### Patch Changes

- 557e3bd: Bump versions

## 0.3.0

### Minor Changes

- 52c7f6c: Bump all packages

## 0.2.0

### Minor Changes

- 4c73fc1: Updates ChugSplash executor to include basic execution flow.
