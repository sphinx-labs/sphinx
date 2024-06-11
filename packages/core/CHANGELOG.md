# @sphinx-labs/core

## 0.26.0

### Minor Changes

- ee6eeed: Opensource platform

### Patch Changes

- Updated dependencies [ee6eeed]
  - @sphinx-labs/contracts@0.23.0

## 0.25.2

### Patch Changes

- fbf95a5: Rollback internal hardhat sim change

## 0.25.1

### Patch Changes

- e65fb7a: Improve reliability of internal hardhat simulation in monorepos

## 0.25.0

### Minor Changes

- a978b3b: Move project registration onto website

### Patch Changes

- Updated dependencies [a978b3b]
  - @sphinx-labs/contracts@0.22.0

## 0.24.9

### Patch Changes

- 01f4d34: Include rollup stack information for all relevant networks
- b54c683: Stop hiding API call error if response code unexpected
- Updated dependencies [01f4d34]
- Updated dependencies [89d421b]
  - @sphinx-labs/contracts@0.21.11

## 0.24.8

### Patch Changes

- 4052629: Disable transaction batching on Arbitrum Sepolia
- 9fa2e5c: Temporarily remove tx data from proposal requests
- Updated dependencies [4052629]
  - @sphinx-labs/contracts@0.21.10

## 0.24.7

### Patch Changes

- 6656771: Allow generating artifacts for deprecated networks
- Updated dependencies [6656771]
  - @sphinx-labs/contracts@0.21.9

## 0.24.6

### Patch Changes

- cc5e9e6: Bump Merkle leaf gas values on networks other than Rootstock
- Updated dependencies [cc5e9e6]
- Updated dependencies [f6e0e06]
  - @sphinx-labs/contracts@0.21.8

## 0.24.5

### Patch Changes

- 50162e5: Disable action batching on Polygon ZKEVM
- Updated dependencies [50162e5]
- Updated dependencies [caf22d4]
  - @sphinx-labs/contracts@0.21.7

## 0.24.4

### Patch Changes

- 957a108: Bump core package version

## 0.24.3

### Patch Changes

- ddfec4c: Update gas heuristics to support large contracts on Rootstock
- Updated dependencies [ddfec4c]
  - @sphinx-labs/contracts@0.21.4

## 0.24.2

### Patch Changes

- 0c375c0: Handle alreay verified response after successful verification submission
- 72f363e: Hardcode merkle leaf gas on Darwinia Pangolin
- Updated dependencies [72f363e]
  - @sphinx-labs/contracts@0.21.3

## 0.24.1

### Patch Changes

- 52ae5f1: Throw an error if contracts are above the size limit
- c7af7ef: Remove deployedContractSizes
- 4f5a1fc: Remove `vm.getCode` to deploy `SphinxUtils` and `SphinxConstants`
- Updated dependencies [c7af7ef]
- Updated dependencies [4f5a1fc]
  - @sphinx-labs/contracts@0.21.2

## 0.24.0

### Minor Changes

- dead3ae: Add Merkle root to preview

### Patch Changes

- 2c89358: Improve rpc url setup for secret management
- e7ff758: Update hard-coded Merkle leaf gas value on Moonbeam
- Updated dependencies [2c89358]
- Updated dependencies [e7ff758]
- Updated dependencies [dd0cfcc]
- Updated dependencies [28b6111]
- Updated dependencies [dead3ae]
  - @sphinx-labs/contracts@0.21.0

## 0.23.10

### Patch Changes

- 8e2d3fe: Add support for Support Taiko Katla, Darwinia Pangolin, Mode, Mode Sepolia, Polygon ZKEVM Cardona, Linea Sepolia
- Updated dependencies [8e2d3fe]
  - @sphinx-labs/contracts@0.20.8

## 0.23.9

### Patch Changes

- 96653d9: Do not use isVerified at all

## 0.23.8

### Patch Changes

- 3446011: Support sending funds to Safe during deployment
- Updated dependencies [3446011]
  - @sphinx-labs/contracts@0.20.7

## 0.23.7

### Patch Changes

- d8ffb22: Reduce Drippie interval
- Updated dependencies [f176e46]
- Updated dependencies [d8ffb22]
- Updated dependencies [c8e5320]
  - @sphinx-labs/contracts@0.20.6

## 0.23.6

### Patch Changes

- 643bcb4: Remove gas limit override on Gnosis
- d3057c7: Hardcode Merkle leaf gas field on Moonbeam networks
- Updated dependencies [d3057c7]
  - @sphinx-labs/contracts@0.20.5

## 0.23.5

### Patch Changes

- e2fc1e9: Fix simulation bugs

## 0.23.4

### Patch Changes

- e36f793: Always attempt to verify contract even if Etherscan claims it is verified
- 93e10af: Include specific transaction data in NetworkGasEstimates
- edf33c0: Check that contracts are deployed in simulation
- 4e2ae6d: Add support for scripts that fork networks
- ff4a186: Add retry and timeout logic to Hardhat simulation
- Updated dependencies [edf33c0]
- Updated dependencies [4e2ae6d]
- Updated dependencies [ff4a186]
  - @sphinx-labs/contracts@0.20.4

## 0.23.3

### Patch Changes

- b036600: Suggest running forge build with --force if we fail to infer artifact
- bdfb0d1: Support Blast and Blast Sepolia
- Updated dependencies [ea7ddf9]
- Updated dependencies [a38b587]
- Updated dependencies [f33d464]
- Updated dependencies [bdfb0d1]
  - @sphinx-labs/contracts@0.20.3

## 0.23.2

### Patch Changes

- 0d8af8f: Fetch artifacts via presigned url
- Updated dependencies [a6e1473]
- Updated dependencies [caa8515]
  - @sphinx-labs/contracts@0.20.2

## 0.23.1

### Patch Changes

- b304407: Use fixed hardhat version

## 0.23.0

### Minor Changes

- 4dfc0ba: Add support for arbitrary entry point functions in the user's script
- 5b6ae62: Let users specify arbitrary network names when deploying and proposing
- 8e5a590: Require configuration via configureSphinx function

### Patch Changes

- 145ddc1: Handle higher storage cost on Moonbeam
- 91d1293: Add support for multiple block explorer configurations on each network
- e8b2c20: Keep previous deployment artifacts
- Updated dependencies [145ddc1]
- Updated dependencies [91d1293]
- Updated dependencies [4dfc0ba]
- Updated dependencies [dc2b2a6]
- Updated dependencies [5b6ae62]
- Updated dependencies [8e5a590]
  - @sphinx-labs/contracts@0.20.0

## 0.22.4

### Patch Changes

- 51087d6: Improve support for Rootstock
- a77d5a2: Increase overridden gas limit on local and forked networks
- Updated dependencies [51087d6]
- Updated dependencies [650a858]
- Updated dependencies [94c4ecc]
  - @sphinx-labs/contracts@0.19.2

## 0.22.3

### Patch Changes

- f980cc2: Handle bytecodeHash=none during etherscan verification

## 0.22.2

### Patch Changes

- 70826a6: Bump hardhat version

## 0.22.1

### Patch Changes

- 16e3ef9: Bump compiler config version

## 0.22.0

### Minor Changes

- cbab29e: Only compile locally

### Patch Changes

- 373c3fa: Adjust gas heuristics to support large contracts on Scroll
- 151b2e2: Make simulation more reliable by using less recent block number
- 83b4974: Use full execution logic in simulation
- 83b4974: Upload compiler config to s3
- 2406ced: Re-enable tests that use live network RPC URLs
- Updated dependencies [373c3fa]
- Updated dependencies [151b2e2]
- Updated dependencies [cbab29e]
- Updated dependencies [f5fac9c]
  - @sphinx-labs/contracts@0.19.0

## 0.21.5

### Patch Changes

- 437e2d3: Prevent Foundry from serializing strings as numbers
- e1445ae: Set max block gas limit in Forge script during collection
- Updated dependencies [437e2d3]
  - @sphinx-labs/contracts@0.18.1

## 0.21.4

### Patch Changes

- ce65752: Decode actions when creating parsed config
- ce65752: Add support for `CREATE` opcode deployments
- 1d7e5ac: Throw error if script contains linked library
- Updated dependencies [c61b557]
- Updated dependencies [ce65752]
- Updated dependencies [0e3ecd8]
- Updated dependencies [ce65752]
- Updated dependencies [bca86ea]
  - @sphinx-labs/contracts@0.18.0

## 0.21.3

### Patch Changes

- e00aa7c: Support Celo, Fuse, Evmos, Kava, Scroll, Moonbeam, Moonriver, OKC, and associated testnets
- Updated dependencies [e00aa7c]
  - @sphinx-labs/contracts@0.17.1

## 0.21.2

### Patch Changes

- 7f49d54: Merge compiler inputs based on build info ID instead of solc version

## 0.21.1

### Patch Changes

- Updated dependencies [952f4bb]
  - @sphinx-labs/contracts@0.17.0

## 0.21.0

### Minor Changes

- e6b4e01: Support monorepo installation

### Patch Changes

- Updated dependencies [87308e3]
- Updated dependencies [e6b4e01]
- Updated dependencies [9107c65]
- Updated dependencies [3094d17]
  - @sphinx-labs/contracts@0.16.0

## 0.20.5

### Patch Changes

- 95511b1: Remove git output when user isn't in a git repository
- dde661c: Add large gas price pad on linea goerli

## 0.20.4

### Patch Changes

- f6ad422: Support CLI deployments on networks not supported by the DevOps Platform
- b802adf: Use artifact inference in Foundry plugin
- c8fc9e0: Remove `CREATE3` proxies from preview warning
- 9b987df: Simplify network integration interface
- d7aa858: Check if init code belongs to contract artifact
- 1d2d46d: Enable deployment artifact cli task
- 57e0dbd: Use bytecode inference to determine contract artifact
- Updated dependencies [f6ad422]
- Updated dependencies [b802adf]
- Updated dependencies [9b987df]
  - @sphinx-labs/contracts@0.15.2

## 0.20.3

### Patch Changes

- 7bbe520: Use default gas estimation overrides on live networks

## 0.20.2

### Patch Changes

- 3a8c30a: Skip the manual confirmation step in proposal dry run

## 0.20.1

### Patch Changes

- 5cbecd5: Set transaction gas limit lower than block gas limit in simulation
- 9e587b9: Remove logic that fast forwards block number on forked local nodes
- 3f6f20c: Test that the simulation works on all supported live networks
- b7614c6: Set simulation account balance to avoid running out of funds

## 0.20.0

### Minor Changes

- ace53d7: Add core logic for deployment artifacts

### Patch Changes

- 187c913: Allow disabling gas price overrides
- Updated dependencies [ace53d7]
  - @sphinx-labs/contracts@0.15.0

## 0.19.1

### Patch Changes

- 4a57beb: Support IR compilation pipeline
- Updated dependencies [5aa6895]
- Updated dependencies [4a57beb]
  - @sphinx-labs/contracts@0.14.2

## 0.19.0

### Minor Changes

- 6981e3e: Post audit updates
- 434b085: Add Etherscan verification for system contracts
- 013c0f9: Update getting started guides and related CLI commands

### Patch Changes

- 0adc1e1: Improve gas estimation
- Updated dependencies [6981e3e]
- Updated dependencies [24576bd]
- Updated dependencies [434b085]
- Updated dependencies [0adc1e1]
- Updated dependencies [5b511e9]
- Updated dependencies [9d5d0a4]
  - @sphinx-labs/contracts@0.14.0

## 0.18.3

### Patch Changes

- 77a18fac: Change all docs to link to the main branch instead of develop
- 22581a16: Fix etherscan verification utility
- Updated dependencies [77a18fac]
  - @sphinx-labs/contracts@0.13.3

## 0.18.2

### Patch Changes

- 0ea4e001: Support native forge scripts
- Updated dependencies [0ea4e001]
  - @sphinx-labs/contracts@0.13.2

## 0.18.1

### Patch Changes

- 431d6ef0: Use broadcast file instead of events to get transaction receipts for deployment artifacts
- f2c5d280: Remove @eth-optimism/contracts-bedrock dependency due to a breaking change in a minor version update in their package
- Updated dependencies [f2c5d280]
  - @sphinx-labs/contracts@0.13.1

## 0.18.0

### Minor Changes

- 330dcc28: First-class support of Forge scripts

### Patch Changes

- Updated dependencies [330dcc28]
  - @sphinx-labs/contracts@0.13.0

## 0.17.0

### Minor Changes

- 275ca040: Remove silent failure on external call revert and/or contract deployment failure

### Patch Changes

- 767b7c0f: Cancel active deployments via proposals
- Updated dependencies [275ca040]
  - @sphinx-labs/contracts@0.12.0

## 0.16.4

### Patch Changes

- e188a1ec: Fix gas estimation bug when executing deployments

## 0.16.3

### Patch Changes

- 9eb0c2fd: Override gas price on linea goerli

## 0.16.2

### Patch Changes

- c13da7ce: Fix gas price overrides on Linea and Polygon POS

## 0.16.1

### Patch Changes

- 3151b899: Add a `callHash` field to the `CallExecuted` event in the `SphinxManager` contract
- Updated dependencies [3151b899]
  - @sphinx-labs/contracts@0.11.1

## 0.16.0

### Minor Changes

- f2bec8ce: Support post-deployment actions
- 2913976d: Update diff to include constructor arg variables and post-deployment actions

### Patch Changes

- d8c984f0: Use a consistent event for executing auth leafs
- f2bec8ce: Support manager version upgrades
- 1c27b462: Fix bug where deployments are not marked as failed if a constructor reverts during deployment
- abd8225f: Combine previous canonical config with new config
- 0685a903: Support deploying UserConfigWithOptions config with the deploy task in hardhat
- 5de8fa58: Make the SphinxAuth contract friendly to local development
- 385bd8b8: Remove the address field from the raw Sphinx actions
- Updated dependencies [d8c984f0]
- Updated dependencies [f2bec8ce]
- Updated dependencies [f2bec8ce]
- Updated dependencies [1c27b462]
- Updated dependencies [5de8fa58]
- Updated dependencies [385bd8b8]
  - @sphinx-labs/contracts@0.11.0

## 0.15.1

### Patch Changes

- 230f6597: Only error when rpc environment variables are actually necessary
- 79ecfdf7: Detect invalid network names for overrides

## 0.15.0

### Minor Changes

- 2b80792b: Upgrade to EthersV6
- 2d0dbe78: Support constructor arg overrides

### Patch Changes

- d2bb2ae6: Integrate multisig support with Sphinx Platform
- eb0cc1c3: Add support for multisigs in the Sphinx config
- Updated dependencies [eb0cc1c3]
- Updated dependencies [2b80792b]
  - @sphinx-labs/contracts@0.10.0

## 0.14.2

### Patch Changes

- 0506a2e7: Incorporate feedback post-prod deployment
- 7ed7d07c: Add support for Base

## 0.14.1

### Patch Changes

- 28075dd4: Support Linea, Avax, Polygon ZKEvm, Fantom

## 0.14.0

### Minor Changes

- 5046395a: Rollback executor refactor

## 0.13.0

### Minor Changes

- 3e7bff4a: Do not recompile during execution

## 0.12.9

### Patch Changes

- 5868f004: Output more accurate log when dry running

## 0.12.8

### Patch Changes

- 9d9257db: Allow proposal to succeed without doing anything

## 0.12.7

### Patch Changes

- 0b309f0c: Support proposals in CI

## 0.12.6

### Patch Changes

- 264bbc23: Handle unexpected response code from sphinx platform api

## 0.12.5

### Patch Changes

- db6e3e2e: Fix polygon mainnet gas price bug
- f5d7503e: Output network name during etherscan verification

## 0.12.4

### Patch Changes

- ec24a7b6: Fix nohoist bug
- 99fd9f09: Remove dependency on inherited forge-std contracts in Sphinx.sol
- Updated dependencies [ec24a7b6]
- Updated dependencies [99fd9f09]
  - @sphinx-labs/contracts@0.9.4

## 0.12.3

### Patch Changes

- e9fc6c67: Output warning for unreliable networks
- ad8a9dd6: Improve logs of proposal CLI tasks

## 0.12.2

### Patch Changes

- a778e4ff: Include build during release process
- Updated dependencies [a778e4ff]
  - @sphinx-labs/contracts@0.9.2

## 0.12.1

### Patch Changes

- 02674b8e: Include readme in release
- edf822d7: Rename scope to sphinx-labs
- Updated dependencies [02674b8e]
- Updated dependencies [edf822d7]
  - @sphinx-labs/contracts@0.9.1

## 0.12.0

### Minor Changes

- 8aad6210: Separate testnets and mainnets in the Sphinx config
- 0b4dd04e: Add first-class support for organizations and one-click multi-chain deployments
- 21e3702f: Remove the concept of an organization in the core logic
- c53f22dd: Add diff to deploy and propose tasks

### Patch Changes

- 5a391224: Add a reference AuthProxy to the initialization logic to verify on Etherscan
- 48668b7e: Add Foundry deploy task and update proposal, test, and init tasks
- 115d3c10: Rebrand
- 4a97c8f9: Add support for contracts in projects and new chains in org config
- 227da3f8: Add crosschain funding contract
- f9ea5503: Compile before displaying the diff in the Foundry deploy task
- 6156fb98: Update diff to include local network info
- 1ce34a93: Add Balance contracts
- b93b5a91: Log warning to the user if a contract deployment is being skipped
- 02a360d9: Remove logic that relies on init code hash
- Updated dependencies [48668b7e]
- Updated dependencies [115d3c10]
- Updated dependencies [0b4dd04e]
- Updated dependencies [227da3f8]
- Updated dependencies [1ce34a93]
- Updated dependencies [21e3702f]
  - @sphinx-labs/contracts@0.9.0

## 0.11.0

### Minor Changes

- b6d1f76: Overhaul Foundry Integration

### Patch Changes

- Updated dependencies [b6d1f76]
  - @sphinx-labs/contracts@0.8.0

## 0.10.1

### Patch Changes

- f13070f: Use Optimism contracts-bedrock package canary version in all Sphinx packages

## 0.10.0

### Minor Changes

- 6b975e7: Bump contracts dependency version

### Patch Changes

- 1dafc2c: Add support for mapping keys that are contract or enum types

## 0.9.0

### Minor Changes

- c319493: Deploy contracts before modifying proxies during execution
- c309331: Add organization ID
- 57cd798: Make Sphinx non-upgradeable
- e797869: Add claimer field to config
- 11fd15c: Make sphinx-deploy task execute locally by default
- ac40b0b: Require that proposers are approved by the project owner

### Patch Changes

- 7ee54af: Assert that the block gas limit is at least 15 million
- 5896c7c: Remove unused `getMinimumSourceNames` function
- 1c5e99a: Add support for async config files
- c43c960: Add input validation for config variables
- ea4bc1e: Add a protocol fee to be collected during execution
- 41f420c: Allow function types in contracts
- 06c9af9: Only initialize Sphinx on local networks
- e2392ad: Update remoteExecution parameter to only be true when proposing on a live network
- d7dc1ba: Resolve inherited private variable conflicts
- fb9442a: Add support for user defined types
- 0ef343d: Write artifacts for proxy and implementation contracts
- e5b9f81: Add SphinxClaimer which will exist on L1
- 2a0939a: Separate local canonical config files by network
- b7e779f: Assert that the contracts in the config are below the contract size limit
- d652952: Use create3 to deploy non-proxy contracts
- 9fccb34: Merge execution functions in the SphinxManager
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
  - @sphinx-labs/contracts@0.7.0

## 0.8.1

### Patch Changes

- 6b3e2ed: Fix Etherscan verification constructor args
- 6b3e2ed: Fix contract verification constructor args

## 0.8.0

### Minor Changes

- 3da5ee8: Add meta upgrades to SphinxRegistry

### Patch Changes

- 3b382d9: Remove filesystem calls that were used during debugging
- ecef09e: Improve executor retry policy
- 3e923a0: Change implementation salt and skip deploying implementation if it's already been deployed
- 22c24d2: Add support for parallel execution
- 35c7a63: Add meta upgrades for root SphinxManager
- Updated dependencies [3da5ee8]
- Updated dependencies [3e923a0]
- Updated dependencies [c76142e]
- Updated dependencies [35c7a63]
  - @sphinx-labs/contracts@0.6.0

## 0.7.0

### Minor Changes

- 9dca319: Integrate Executor with Sphinx Managed

### Patch Changes

- 5dcb7d3: Allow user to specify a previous storage layout in their Sphinx file
- c8af97c: Update `setStorage` function to set only a segment of a storage slot
- 44e592e: Add the 'preserve' keyword that allows variables to be maintained across upgrades
- 80b1a53: Refactor functions that get build info and storage layout
- 6a48dd7: Remove circular dependencies
- 736b859: Update contract unit tests to reflect new storage slot segment setter
- Updated dependencies [20f1a7e]
- Updated dependencies [c8af97c]
- Updated dependencies [736b859]
  - @sphinx-labs/contracts@0.5.2

## 0.6.1

### Patch Changes

- ca6d384: Bump contracts
- Updated dependencies [ca6d384]
  - @sphinx-labs/contracts@0.5.1

## 0.6.0

### Minor Changes

- 3b13db4: Set immutable variables in the Sphinx file via the 'constructorArgs' field
- fa3f420: Add support for UUPS proxies

### Patch Changes

- 04dba20: Update fund task to optionally automatically calculate the amount of funds to send
- 5c6846e: Remove hard-coded chain id 31337
- 263b34d: Add logic for claiming bundles
- 57a327d: Temporarily allow anyone to propose bundles
- Updated dependencies [263b34d]
- Updated dependencies [fa3f420]
- Updated dependencies [57a327d]
  - @sphinx-labs/contracts@0.5.0

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
  - @sphinx-labs/contracts@0.4.3

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
  - @sphinx-labs/contracts@0.4.2

## 0.4.2

### Patch Changes

- 68c1a56: Remove `initializeSphinx` call in register and propose task

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
- c8664a2: Check if proxy is deployed before transferring to Sphinx
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
  - @sphinx-labs/contracts@0.4.0

## 0.3.24

### Patch Changes

- 2267ec4: Bump versions
- Updated dependencies [2267ec4]
  - @sphinx-labs/contracts@0.3.17

## 0.3.23

### Patch Changes

- d6984ec: Override transaction gas prices to use EIP-1559 if supported by the network

## 0.3.22

### Patch Changes

- 1cb43e7: Fix Etherscan bug that was caused by an incorrect calculation of implementation addresses
- acfe88d: Improve execution cost estimation
- fdf512b: Adds a universal salt that makes it easy to deploy new versions of the Sphinx contracts
- Updated dependencies [10f3054]
- Updated dependencies [fdf512b]
- Updated dependencies [88e9465]
- Updated dependencies [a60020a]
  - @sphinx-labs/contracts@0.3.16

## 0.3.21

### Patch Changes

- 74a61c0: Change deployment process so that Sphinx addresses are calculated based on multisig address
- baf3ac1: Changes contract reference syntax from '!Ref' to '{{ }}'
- 89cd352: feat(core): support bytes/strings (length >31)
- dba31f7: Write canonical config to file system when using executing bundles locally
- c9eeb47: Make configPath a normal parameter on all tasks
- Updated dependencies [74a61c0]
- Updated dependencies [3ec7a05]
  - @sphinx-labs/contracts@0.3.15

## 0.3.20

### Patch Changes

- 3f6cabd: Smarter management of batched action execution
- 921f917: Improved logs for funding and post-execution actions
- d8554c0: Prefix logs with [Sphinx]
- 780a395: Standardize logger messages
- 335dfc7: Adds more logs to the Sphinx setup process in the executor
- ba24573: Add list-proposers and add-proposers tasks
- 276d5ea: Adds function comments to several type checking functions
- Updated dependencies [c5cf649]
  - @sphinx-labs/contracts@0.3.14

## 0.3.19

### Patch Changes

- 52d0556: Change the ContractConfig's "address" field to "proxy"
- 65bc432: Execution gas cost estimation bug fixes
- 38c62b5: Refactor functions that check if an address is a contract
- e7ae731: Improve execution cost estimation
- 2652df5: Fixes circular dependency issue caused by `isContractDeployed`
- Updated dependencies [7047b9d]
- Updated dependencies [b55ab15]
  - @sphinx-labs/contracts@0.3.13

## 0.3.18

### Patch Changes

- e105ea9: Updates Hardhat tasks to reflect proposer/owner requirement
- Updated dependencies [40c7bfb]
  - @sphinx-labs/contracts@0.3.12

## 0.3.17

### Patch Changes

- d7fff20: Several improvements / bug fixes discovered when deploying on Optimism's devnet.
- 7e8dd1e: Removes the projectOwner from the Sphinx config
- Updated dependencies [d7fff20]
- Updated dependencies [b1850ad]
- Updated dependencies [e1dc2ec]
- Updated dependencies [da79232]
  - @sphinx-labs/contracts@0.3.11

## 0.3.16

### Patch Changes

- 74da4d0: Simplify storage slot encoding logic
- 7a1737e: Separate config type into UserSphinxConfig and ParsedSphinxConfig
- c32f23e: Add basic support for upgrades
- 16348b2: Make the SphinxRegistry proxy's address deterministic
- fd5177e: Add sphinx-list-projects Hardhat task
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
- f217221: Use the executor to deploy and verify the Sphinx predeployed contracts
- 780e54f: Submit the minimum compiler input necessary to verify contracts on Etherscan
- ec41164: Remove console.log
- da5cb35: Move the logic that initializes the Sphinx predeploys into the executor.
- 5406b7b: Update canonical Sphinx config type usage
- Updated dependencies [6f83489]
- Updated dependencies [16348b2]
- Updated dependencies [9be91c3]
  - @sphinx-labs/contracts@0.3.10

## 0.3.15

### Patch Changes

- 457b19a: Improve sphinx-deploy hardhat task
- Updated dependencies [ed7babc]
  - @sphinx-labs/contracts@0.3.9

## 0.3.14

### Patch Changes

- 8323afb: Add deployment artifact generation on the user's side

## 0.3.13

### Patch Changes

- 15ebe78: Hardhat task bug fixes and improvements

## 0.3.12

### Patch Changes

- ecafe45: Refactor sphinx-commit and sphinx-load subtasks

## 0.3.11

### Patch Changes

- 9d38797: Update sphinx-register task to work locally
- Updated dependencies [6a6f0c0]
  - @sphinx-labs/contracts@0.3.8

## 0.3.10

### Patch Changes

- 21df9d7: Add Etherscan verification in executor
- 273d4c3: Use creation bytecode instead of the `DEPLOY_CODE_PREFIX` to deploy implementation contracts for Etherscan compatibility
- 6daea1a: Add artifact generation for deployments
- Updated dependencies [a536675]
- Updated dependencies [273d4c3]
- Updated dependencies [c08a950]
- Updated dependencies [78acb9a]
  - @sphinx-labs/contracts@0.3.7

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
  - @sphinx-labs/contracts@0.3.5

## 0.3.3

### Patch Changes

- 4ce753b: Add function that checks if a Sphinx config file is empty
- 2c5b238: Change config file names
- 2c5b238: Support demo
- Updated dependencies [2c5b238]
  - @sphinx-labs/contracts@0.3.3

## 0.3.2

### Patch Changes

- 03d557c: Bump all versions
- Updated dependencies [03d557c]
  - @sphinx-labs/contracts@0.3.2

## 0.3.1

### Patch Changes

- 557e3bd: Bump versions
- Updated dependencies [557e3bd]
- Updated dependencies [cd310fe]
  - @sphinx-labs/contracts@0.3.1

## 0.3.0

### Minor Changes

- 52c7f6c: Bump all packages

### Patch Changes

- Updated dependencies [52c7f6c]
  - @sphinx-labs/contracts@0.3.0

## 0.2.1

### Patch Changes

- f7a4a24: Bump versions of core and plugins packages
- f7a4a24: Bump core and plugins packages

## 0.2.0

### Minor Changes

- 19cf359: Adds local Sphinx deployments for testing contracts on the Hardhat network.

### Patch Changes

- Updated dependencies [416d41b]
- Updated dependencies [19cf359]
- Updated dependencies [53e1514]
  - @sphinx-labs/contracts@0.2.0

## 0.1.1

### Patch Changes

- 04ada98: Adds a hardhat task that shows the live status of an upgrade.
