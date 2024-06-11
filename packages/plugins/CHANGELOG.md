# @sphinx-labs/plugins

## 0.33.0

### Minor Changes

- ee6eeed: Opensource platform

### Patch Changes

- Updated dependencies [ee6eeed]
  - @sphinx-labs/contracts@0.23.0
  - @sphinx-labs/core@0.26.0

## 0.32.2

### Patch Changes

- fbf95a5: Rollback internal hardhat sim change
- Updated dependencies [fbf95a5]
  - @sphinx-labs/core@0.25.2

## 0.32.1

### Patch Changes

- e65fb7a: Improve reliability of internal hardhat simulation in monorepos
- Updated dependencies [e65fb7a]
  - @sphinx-labs/core@0.25.1

## 0.32.0

### Minor Changes

- a978b3b: Move project registration onto website

### Patch Changes

- Updated dependencies [a978b3b]
  - @sphinx-labs/contracts@0.22.0
  - @sphinx-labs/core@0.25.0

## 0.31.12

### Patch Changes

- 01f4d34: Include rollup stack information for all relevant networks
- b54c683: Stop hiding API call error if response code unexpected
- 89d421b: Support Astart zkEVM, Mantle, Crab
- Updated dependencies [01f4d34]
- Updated dependencies [b54c683]
- Updated dependencies [89d421b]
  - @sphinx-labs/contracts@0.21.11
  - @sphinx-labs/core@0.24.9

## 0.31.11

### Patch Changes

- 4052629: Disable transaction batching on Arbitrum Sepolia
- 9fa2e5c: Temporarily remove tx data from proposal requests
- Updated dependencies [4052629]
- Updated dependencies [9fa2e5c]
  - @sphinx-labs/contracts@0.21.10
  - @sphinx-labs/core@0.24.8

## 0.31.10

### Patch Changes

- 6656771: Allow generating artifacts for deprecated networks
- Updated dependencies [6656771]
  - @sphinx-labs/contracts@0.21.9
  - @sphinx-labs/core@0.24.7

## 0.31.9

### Patch Changes

- cc5e9e6: Bump Merkle leaf gas values on networks other than Rootstock
- f6e0e06: Deprecate Polygon Mumbai
- Updated dependencies [cc5e9e6]
- Updated dependencies [f6e0e06]
  - @sphinx-labs/contracts@0.21.8
  - @sphinx-labs/core@0.24.6

## 0.31.8

### Patch Changes

- 50162e5: Disable action batching on Polygon ZKEVM
- caf22d4: Support Polygon Amoy
- Updated dependencies [50162e5]
- Updated dependencies [caf22d4]
  - @sphinx-labs/contracts@0.21.7
  - @sphinx-labs/core@0.24.5

## 0.31.7

### Patch Changes

- 7f8beaa: Remove depth from Sphinx validate
- Updated dependencies [7f8beaa]
  - @sphinx-labs/contracts@0.21.6

## 0.31.6

### Patch Changes

- 957a108: Bump core package version
- Updated dependencies [957a108]
  - @sphinx-labs/core@0.24.4

## 0.31.5

### Patch Changes

- c0fec2d: Lower hardcoded merkle leaf gas on Pangolin
- Updated dependencies [c0fec2d]
  - @sphinx-labs/contracts@0.21.5

## 0.31.4

### Patch Changes

- ddfec4c: Update gas heuristics to support large contracts on Rootstock
- Updated dependencies [ddfec4c]
  - @sphinx-labs/contracts@0.21.4
  - @sphinx-labs/core@0.24.3

## 0.31.3

### Patch Changes

- 72f363e: Hardcode merkle leaf gas on Darwinia Pangolin
- Updated dependencies [0c375c0]
- Updated dependencies [72f363e]
  - @sphinx-labs/core@0.24.2
  - @sphinx-labs/contracts@0.21.3

## 0.31.2

### Patch Changes

- 52ae5f1: Throw an error if contracts are above the size limit
- 54b192c: Lower the number of max retries in the simulation
- c7af7ef: Remove deployedContractSizes
- 149783c: Stop overriding 'ETH_FROM'
- 4f5a1fc: Remove `vm.getCode` to deploy `SphinxUtils` and `SphinxConstants`
- Updated dependencies [52ae5f1]
- Updated dependencies [c7af7ef]
- Updated dependencies [4f5a1fc]
  - @sphinx-labs/core@0.24.1
  - @sphinx-labs/contracts@0.21.2

## 0.31.1

### Patch Changes

- 19370da: Add support for Darwinia Pangolin
- Updated dependencies [19370da]
  - @sphinx-labs/contracts@0.21.1

## 0.31.0

### Minor Changes

- dead3ae: Add Merkle root to preview

### Patch Changes

- 2c89358: Improve rpc url setup for secret management
- e7ff758: Update hard-coded Merkle leaf gas value on Moonbeam
- fd5ac04: Enable caching in simulation
- dd0cfcc: Prevent `forge build --sizes` from failing due to `SphinxUtils.sol`
- Updated dependencies [2c89358]
- Updated dependencies [e7ff758]
- Updated dependencies [dd0cfcc]
- Updated dependencies [28b6111]
- Updated dependencies [dead3ae]
  - @sphinx-labs/core@0.24.0
  - @sphinx-labs/contracts@0.21.0

## 0.30.12

### Patch Changes

- 8e2d3fe: Add support for Support Taiko Katla, Darwinia Pangolin, Mode, Mode Sepolia, Polygon ZKEVM Cardona, Linea Sepolia
- Updated dependencies [8e2d3fe]
  - @sphinx-labs/contracts@0.20.8
  - @sphinx-labs/core@0.23.10

## 0.30.11

### Patch Changes

- 3446011: Support sending funds to Safe during deployment
- Updated dependencies [3446011]
  - @sphinx-labs/contracts@0.20.7
  - @sphinx-labs/core@0.23.8

## 0.30.10

### Patch Changes

- f176e46: Increase Sepolia drip size to handle gas price spikes
- d8ffb22: Reduce Drippie interval
- c8e5320: Drop support for OKTC
- Updated dependencies [f176e46]
- Updated dependencies [d8ffb22]
- Updated dependencies [c8e5320]
  - @sphinx-labs/contracts@0.20.6
  - @sphinx-labs/core@0.23.7

## 0.30.9

### Patch Changes

- 643bcb4: Remove gas limit override on Gnosis
- d3057c7: Hardcode Merkle leaf gas field on Moonbeam networks
- Updated dependencies [643bcb4]
- Updated dependencies [d3057c7]
  - @sphinx-labs/core@0.23.6
  - @sphinx-labs/contracts@0.20.5

## 0.30.8

### Patch Changes

- 4cc6c75: Do not force recompile

## 0.30.7

### Patch Changes

- e2fc1e9: Fix simulation bugs
- Updated dependencies [e2fc1e9]
  - @sphinx-labs/core@0.23.5

## 0.30.6

### Patch Changes

- e36f793: Always attempt to verify contract even if Etherscan claims it is verified
- 93e10af: Include specific transaction data in NetworkGasEstimates
- edf33c0: Check that contracts are deployed in simulation
- 24e1dcc: Avoid recompiling every single time we invoke the users script
- 6c36c1f: Ensure cache directory always exists
- 4e2ae6d: Add support for scripts that fork networks
- ff4a186: Add retry and timeout logic to Hardhat simulation
- Updated dependencies [e36f793]
- Updated dependencies [93e10af]
- Updated dependencies [edf33c0]
- Updated dependencies [4e2ae6d]
- Updated dependencies [ff4a186]
  - @sphinx-labs/core@0.23.4
  - @sphinx-labs/contracts@0.20.4

## 0.30.5

### Patch Changes

- 76bcb9e: Passthrough getaddrinfo error using standard json format
- 23476e7: Throw an error if the simulation is going to fail due to missing hardhat config
- bdfb0d1: Support Blast and Blast Sepolia
- Updated dependencies [ea7ddf9]
- Updated dependencies [a38b587]
- Updated dependencies [f33d464]
- Updated dependencies [b036600]
- Updated dependencies [bdfb0d1]
  - @sphinx-labs/contracts@0.20.3
  - @sphinx-labs/core@0.23.3

## 0.30.4

### Patch Changes

- 5d482d6: Error if getaddrinfo ENOTFOUND occurs a large number of times

## 0.30.3

### Patch Changes

- 0d8af8f: Fetch artifacts via presigned url
- a6e1473: Filter calls to SphinxUtils out of state diff
- Updated dependencies [0d8af8f]
- Updated dependencies [a6e1473]
- Updated dependencies [caa8515]
  - @sphinx-labs/core@0.23.2
  - @sphinx-labs/contracts@0.20.2

## 0.30.2

### Patch Changes

- fb439d6: Support installing Sphinx Library contracts via NPM
- Updated dependencies [fb439d6]
  - @sphinx-labs/contracts@0.20.1

## 0.30.1

### Patch Changes

- b304407: Use fixed hardhat version
- Updated dependencies [b304407]
  - @sphinx-labs/core@0.23.1

## 0.30.0

### Minor Changes

- 4dfc0ba: Add support for arbitrary entry point functions in the user's script
- 5b6ae62: Let users specify arbitrary network names when deploying and proposing
- 8e5a590: Require configuration via configureSphinx function

### Patch Changes

- 8f4b270: Remove requirement for Foundry fork
- 145ddc1: Handle higher storage cost on Moonbeam
- 91d1293: Add support for multiple block explorer configurations on each network
- 1373688: Continue with retries on rate limiting
- e8b2c20: Keep previous deployment artifacts
- dc2b2a6: Use call depth when filtering AccountAccesses
- 342864a: Remove FOUNDRY_SENDER during collection phase
- 56bae32: Set FOUNDRY_SENDER and ETH_FROM during transaction collection
- Updated dependencies [145ddc1]
- Updated dependencies [91d1293]
- Updated dependencies [4dfc0ba]
- Updated dependencies [e8b2c20]
- Updated dependencies [dc2b2a6]
- Updated dependencies [5b6ae62]
- Updated dependencies [8e5a590]
  - @sphinx-labs/contracts@0.20.0
  - @sphinx-labs/core@0.23.0

## 0.29.6

### Patch Changes

- b84b7d0: Add timeout and retry logic to simulation

## 0.29.5

### Patch Changes

- 38249c2: Resolve block.number bug on Arbitrum
- Updated dependencies [38249c2]
  - @sphinx-labs/contracts@0.19.1

## 0.29.4

### Patch Changes

- f980cc2: Handle bytecodeHash=none during etherscan verification
- Updated dependencies [f980cc2]
  - @sphinx-labs/core@0.22.3

## 0.29.3

### Patch Changes

- 71ec0a6: Bump hardhat version

## 0.29.2

### Patch Changes

- 6c521cb: Prompt to install Foundry fork during init

## 0.29.1

### Patch Changes

- 16e3ef9: Bump compiler config version
- Updated dependencies [16e3ef9]
  - @sphinx-labs/core@0.22.1

## 0.29.0

### Minor Changes

- cbab29e: Only compile locally
- f5fac9c: Check mismatch between plugins package and contracts library early

### Patch Changes

- 054f745: Normalize script path
- 373c3fa: Adjust gas heuristics to support large contracts on Scroll
- 151b2e2: Make simulation more reliable by using less recent block number
- 83b4974: Use full execution logic in simulation
- 83b4974: Upload compiler config to s3
- 2406ced: Re-enable tests that use live network RPC URLs
- Updated dependencies [373c3fa]
- Updated dependencies [151b2e2]
- Updated dependencies [83b4974]
- Updated dependencies [cbab29e]
- Updated dependencies [83b4974]
- Updated dependencies [2406ced]
- Updated dependencies [f5fac9c]
  - @sphinx-labs/contracts@0.19.0
  - @sphinx-labs/core@0.22.0

## 0.28.1

### Patch Changes

- 437e2d3: Prevent Foundry from serializing strings as numbers
- e1445ae: Set max block gas limit in Forge script during collection
- 9d0c02c: Recommend using github action in CI
- Updated dependencies [437e2d3]
- Updated dependencies [e1445ae]
  - @sphinx-labs/contracts@0.18.1
  - @sphinx-labs/core@0.21.5

## 0.28.0

### Minor Changes

- 64880c7: Throw error Sphinx Foundry fork is not installed
- ce65752: Add support for `CREATE` opcode deployments

### Patch Changes

- ce65752: Decode actions when creating parsed config
- ea33cd4: Handle absolute paths when asserting no linked libraries
- 9c71c5e: Use local RPC endpoints in Deploy and Propose integration tests
- 1d7e5ac: Throw error if script contains linked library
- Updated dependencies [c61b557]
- Updated dependencies [ce65752]
- Updated dependencies [0e3ecd8]
- Updated dependencies [ce65752]
- Updated dependencies [bca86ea]
- Updated dependencies [1d7e5ac]
  - @sphinx-labs/contracts@0.18.0
  - @sphinx-labs/core@0.21.4

## 0.27.3

### Patch Changes

- ecf87be: Support Rootstock, Evmos, Kava, Scroll, Moonbeam, Moonriver, OKT Chain

## 0.27.2

### Patch Changes

- c289baa: Add handling for previously installed incorrect version
- Updated dependencies [7f49d54]
  - @sphinx-labs/core@0.21.2

## 0.27.1

### Patch Changes

- Updated dependencies [952f4bb]
  - @sphinx-labs/contracts@0.17.0
  - @sphinx-labs/core@0.21.1

## 0.27.0

### Minor Changes

- e6b4e01: Support monorepo installation

### Patch Changes

- 3af5552: Add sphinx install command
- ce5c34a: Install Sphinx Library contracts during init command
- Updated dependencies [87308e3]
- Updated dependencies [e6b4e01]
- Updated dependencies [9107c65]
- Updated dependencies [3094d17]
  - @sphinx-labs/contracts@0.16.0
  - @sphinx-labs/core@0.21.0

## 0.26.5

### Patch Changes

- f6ad422: Support CLI deployments on networks not supported by the DevOps Platform
- c0b72d8: Remove unused legacy network variables
- 1640d3c: Use more specific fs_permissions configuration
- b802adf: Use artifact inference in Foundry plugin
- d426f7c: Rename Gnosis Safe address variable for clarity
- c8fc9e0: Remove `CREATE3` proxies from preview warning
- 9b987df: Simplify network integration interface
- d7aa858: Check if init code belongs to contract artifact
- aa6203b: Optimize deployments in proposal test suite
- 1d2d46d: Enable deployment artifact cli task
- 57e0dbd: Use bytecode inference to determine contract artifact
- Updated dependencies [f6ad422]
- Updated dependencies [b802adf]
- Updated dependencies [c8fc9e0]
- Updated dependencies [9b987df]
- Updated dependencies [d7aa858]
- Updated dependencies [1d2d46d]
- Updated dependencies [57e0dbd]
  - @sphinx-labs/contracts@0.15.2
  - @sphinx-labs/core@0.20.4

## 0.26.4

### Patch Changes

- ae4d24c: Use `CREATE2` salt in quickstart guide to prevent contract address collision
- 7bbe520: Use default gas estimation overrides on live networks
- 15b9a25: Display error from child process in simulation
- d529b1f: Remove force recompilation in deploy and propose CLI commands
- Updated dependencies [7bbe520]
  - @sphinx-labs/core@0.20.3

## 0.26.3

### Patch Changes

- 108866c: Make block numbers more accurate in simulation
- 3a8c30a: Skip the manual confirmation step in proposal dry run
- Updated dependencies [3a8c30a]
  - @sphinx-labs/core@0.20.2

## 0.26.2

### Patch Changes

- dbbd869: Temporarily remove simulation test suite to prevent rate limits
- Updated dependencies [8fe3fd9]
  - @sphinx-labs/contracts@0.15.1

## 0.26.1

### Patch Changes

- c3ad210: Calculate correct Sphinx Module address for non-zero salt nonce
- 0b42d2e: Force compile as late as possible
- 5cbecd5: Set transaction gas limit lower than block gas limit in simulation
- 9e587b9: Remove logic that fast forwards block number on forked local nodes
- bb0b9af: Add tests for CLI args
- 3f6f20c: Test that the simulation works on all supported live networks
- b7614c6: Set simulation account balance to avoid running out of funds
- Updated dependencies [5cbecd5]
- Updated dependencies [9e587b9]
- Updated dependencies [3f6f20c]
- Updated dependencies [b7614c6]
  - @sphinx-labs/core@0.20.1

## 0.26.0

### Minor Changes

- ace53d7: Add core logic for deployment artifacts

### Patch Changes

- 30a1296: Use scriptPath positional param in propose CLI command
- ecededa: Stop requiring the user to override the `run()` function in their script.
- Updated dependencies [ace53d7]
- Updated dependencies [187c913]
  - @sphinx-labs/contracts@0.15.0
  - @sphinx-labs/core@0.20.0

## 0.25.1

### Patch Changes

- 31e5e6a: Skip logging simulation output

## 0.25.0

### Minor Changes

- 059071e: Store compiler config privately

### Patch Changes

- 2ebbbcc: Improve handling of forge script failures
- 5aa6895: Remove dependency on @openzeppelin/contracts in SphinxUtils
- 111e376: Use Arbitrum Sepolia in Getting Started guides
- 4a57beb: Support IR compilation pipeline
- Updated dependencies [5aa6895]
- Updated dependencies [4a57beb]
  - @sphinx-labs/contracts@0.14.2
  - @sphinx-labs/core@0.19.1

## 0.24.0

### Minor Changes

- 6981e3e: Post audit updates
- 434b085: Add Etherscan verification for system contracts
- 013c0f9: Update getting started guides and related CLI commands

### Patch Changes

- ba1ac16: Modify Merkle leaf gas by a smaller buffer (1.3x + 20k)
- 3003c11: Hard-code gas on Arbitrum Sepolia
- 24576bd: Validate live network broadcast before retrieving private key
- 0adc1e1: Improve gas estimation
- 5b511e9: Make gas estimate more robust by using `gasleft()`
- Updated dependencies [6981e3e]
- Updated dependencies [24576bd]
- Updated dependencies [434b085]
- Updated dependencies [0adc1e1]
- Updated dependencies [5b511e9]
- Updated dependencies [9d5d0a4]
- Updated dependencies [013c0f9]
  - @sphinx-labs/contracts@0.14.0
  - @sphinx-labs/core@0.19.0

## 0.23.6

### Patch Changes

- 0d764817: Don't include forge-std and ds-test in recommended remappings

## 0.23.5

### Patch Changes

- c2202c3a: Validate that the chain ID is correct in the user's script
- 8ad7d5fc: Update init command to better support pnpm

## 0.23.4

### Patch Changes

- 77a18fac: Change all docs to link to the main branch instead of develop
- Updated dependencies [77a18fac]
- Updated dependencies [22581a16]
  - @sphinx-labs/contracts@0.13.3
  - @sphinx-labs/core@0.18.3

## 0.23.3

### Patch Changes

- 0ea4e001: Support native forge scripts
- Updated dependencies [0ea4e001]
  - @sphinx-labs/contracts@0.13.2
  - @sphinx-labs/core@0.18.2

## 0.23.2

### Patch Changes

- e726efbb: Fix quickstart Sphinx dependency remappings

## 0.23.1

### Patch Changes

- 431d6ef0: Use broadcast file instead of events to get transaction receipts for deployment artifacts
- b938c2d8: Update remappings and dependencies in quickstart guide
- f2c5d280: Remove @eth-optimism/contracts-bedrock dependency due to a breaking change in a minor version update in their package
- Updated dependencies [431d6ef0]
- Updated dependencies [f2c5d280]
  - @sphinx-labs/core@0.18.1
  - @sphinx-labs/contracts@0.13.1

## 0.23.0

### Minor Changes

- 330dcc28: First-class support of Forge scripts

### Patch Changes

- b15ad66c: Add .gitignore to config files generated in the `sphinx init` task
- Updated dependencies [330dcc28]
  - @sphinx-labs/contracts@0.13.0
  - @sphinx-labs/core@0.18.0

## 0.22.0

### Minor Changes

- 275ca040: Remove silent failure on external call revert and/or contract deployment failure

### Patch Changes

- 767b7c0f: Cancel active deployments via proposals
- Updated dependencies [767b7c0f]
- Updated dependencies [275ca040]
  - @sphinx-labs/core@0.17.0
  - @sphinx-labs/contracts@0.12.0

## 0.21.2

### Patch Changes

- 6358e916: Restrict @swc/core dependency version

## 0.21.1

### Patch Changes

- c13da7ce: Fix gas price overrides on Linea and Polygon POS
- Updated dependencies [c13da7ce]
  - @sphinx-labs/core@0.16.2

## 0.21.0

### Minor Changes

- f2bec8ce: Support post-deployment actions

### Patch Changes

- d8c984f0: Use a consistent event for executing auth leafs
- f2bec8ce: Support manager version upgrades
- 1c27b462: Fix bug where deployments are not marked as failed if a constructor reverts during deployment
- 5de8fa58: Make the SphinxAuth contract friendly to local development
- 385bd8b8: Remove the address field from the raw Sphinx actions
- Updated dependencies [d8c984f0]
- Updated dependencies [f2bec8ce]
- Updated dependencies [f2bec8ce]
- Updated dependencies [1c27b462]
- Updated dependencies [2913976d]
- Updated dependencies [abd8225f]
- Updated dependencies [0685a903]
- Updated dependencies [5de8fa58]
- Updated dependencies [385bd8b8]
  - @sphinx-labs/contracts@0.11.0
  - @sphinx-labs/core@0.16.0

## 0.20.1

### Patch Changes

- 79ecfdf7: Detect invalid network names for overrides
- Updated dependencies [230f6597]
- Updated dependencies [79ecfdf7]
  - @sphinx-labs/core@0.15.1

## 0.20.0

### Minor Changes

- 2b80792b: Upgrade to EthersV6
- 2d0dbe78: Support constructor arg overrides

### Patch Changes

- d2bb2ae6: Integrate multisig support with Sphinx Platform
- eb0cc1c3: Add support for multisigs in the Sphinx config
- Updated dependencies [d2bb2ae6]
- Updated dependencies [eb0cc1c3]
- Updated dependencies [2b80792b]
- Updated dependencies [2d0dbe78]
  - @sphinx-labs/core@0.15.0
  - @sphinx-labs/contracts@0.10.0

## 0.19.3

### Patch Changes

- 0506a2e7: Incorporate feedback post-prod deployment
- 7ed7d07c: Add support for Base
- Updated dependencies [0506a2e7]
- Updated dependencies [7ed7d07c]
  - @sphinx-labs/core@0.14.2

## 0.19.2

### Patch Changes

- 28075dd4: Support Linea, Avax, Polygon ZKEvm, Fantom
- Updated dependencies [28075dd4]
  - @sphinx-labs/core@0.14.1

## 0.19.1

### Patch Changes

- 059f7686: Parse rpc endpoints with env variables that occur anywhere in the string

## 0.19.0

### Minor Changes

- 5046395a: Rollback executor refactor

### Patch Changes

- Updated dependencies [5046395a]
  - @sphinx-labs/core@0.14.0

## 0.18.0

### Minor Changes

- 3e7bff4a: Do not recompile during execution

### Patch Changes

- Updated dependencies [3e7bff4a]
  - @sphinx-labs/core@0.13.0

## 0.17.7

### Patch Changes

- 0b309f0c: Support proposals in CI
- Updated dependencies [0b309f0c]
  - @sphinx-labs/core@0.12.7

## 0.17.6

### Patch Changes

- 264bbc23: Handle unexpected response code from sphinx platform api
- Updated dependencies [264bbc23]
  - @sphinx-labs/core@0.12.6

## 0.17.5

### Patch Changes

- 3ee9949e: Use 127.0.0.1 instead of localhost
- ec24a7b6: Fix nohoist bug
- 99fd9f09: Remove dependency on inherited forge-std contracts in Sphinx.sol
- Updated dependencies [ec24a7b6]
- Updated dependencies [99fd9f09]
  - @sphinx-labs/contracts@0.9.4
  - @sphinx-labs/core@0.12.4

## 0.17.4

### Patch Changes

- ad8a9dd6: Improve logs of proposal CLI tasks
- d8818e28: Parse env vars in rpc endpoints in foundry.toml
- Updated dependencies [e9fc6c67]
- Updated dependencies [ad8a9dd6]
  - @sphinx-labs/core@0.12.3

## 0.17.3

### Patch Changes

- d88ec605: Fix bugs in getting started guides
- Updated dependencies [d88ec605]
  - @sphinx-labs/contracts@0.9.3

## 0.17.2

### Patch Changes

- a778e4ff: Include build during release process
- Updated dependencies [a778e4ff]
  - @sphinx-labs/contracts@0.9.2
  - @sphinx-labs/core@0.12.2

## 0.17.1

### Patch Changes

- 02674b8e: Include readme in release
- edf822d7: Rename scope to sphinx-labs
- Updated dependencies [02674b8e]
- Updated dependencies [edf822d7]
  - @sphinx-labs/contracts@0.9.1
  - @sphinx-labs/core@0.12.1

## 0.17.0

### Minor Changes

- 8aad6210: Separate testnets and mainnets in the Sphinx config
- 48668b7e: Add Foundry deploy task and update proposal, test, and init tasks
- 0b4dd04e: Add first-class support for organizations and one-click multi-chain deployments

### Patch Changes

- 1b0540c0: Fix compilation issue when optimizer disabled
- f0bb0351: Update init tasks and add tests for TypeScript init tasks
- 115d3c10: Rebrand
- 77e1496c: Update Foundry propose task to display diff
- 4a97c8f9: Add support for contracts in projects and new chains in org config
- f9ea5503: Compile before displaying the diff in the Foundry deploy task
- 6156fb98: Update diff to include local network info
- 1ce34a93: Add Balance contracts
- 83340e80: Detect ambiguous contract names in foundry
- 21e3702f: Remove the concept of an organization in the core logic
- c53f22dd: Add diff to deploy and propose tasks
- ab3a11c5: Use cache to avoid reading all build info files
- 4e6a91e7: Support fully qualified names in foundry
- 02a360d9: Remove logic that relies on init code hash
- Updated dependencies [8aad6210]
- Updated dependencies [5a391224]
- Updated dependencies [48668b7e]
- Updated dependencies [115d3c10]
- Updated dependencies [4a97c8f9]
- Updated dependencies [0b4dd04e]
- Updated dependencies [227da3f8]
- Updated dependencies [f9ea5503]
- Updated dependencies [6156fb98]
- Updated dependencies [1ce34a93]
- Updated dependencies [21e3702f]
- Updated dependencies [c53f22dd]
- Updated dependencies [b93b5a91]
- Updated dependencies [02a360d9]
  - @sphinx-labs/core@0.12.0
  - @sphinx-labs/contracts@0.9.0

## 0.16.5

### Patch Changes

- aebb841: Fix issue importing SphinxUtils artifacts

## 0.16.4

### Patch Changes

- d239c16: Fix sample project bugs

## 0.16.3

### Patch Changes

- 98794eb: Add `vm.readCallers` to the Foundry deployment process
- 8d2bf40: Fix issues with sample project generation
- 586c823: Minimize size of Sphinx.sol and allow Solidity versions >= 0.7.4
- Updated dependencies [586c823]
  - @sphinx-labs/contracts@0.8.2

## 0.16.2

### Patch Changes

- 60d60bc: Specify compiler version range for foundry library contracts
- Updated dependencies [60d60bc]
  - @sphinx-labs/contracts@0.8.1

## 0.16.1

### Patch Changes

- 83a83e2: Fix issue where reading registry code fails on live network during proposal

## 0.16.0

### Minor Changes

- b6d1f76: Overhaul Foundry Integration

### Patch Changes

- Updated dependencies [b6d1f76]
  - @sphinx-labs/contracts@0.8.0
  - @sphinx-labs/core@0.11.0

## 0.15.1

### Patch Changes

- f13070f: Use Optimism contracts-bedrock package canary version in all Sphinx packages
- Updated dependencies [f13070f]
  - @sphinx-labs/core@0.10.1

## 0.15.0

### Minor Changes

- 6b975e7: Bump contracts dependency version

### Patch Changes

- 1dafc2c: Add support for mapping keys that are contract or enum types
- Updated dependencies [1dafc2c]
- Updated dependencies [6b975e7]
  - @sphinx-labs/core@0.10.0

## 0.14.1

### Patch Changes

- 8fe018e: Change Hardhat `node` task param from 'silent' to 'hide' due to conflict with existing task

## 0.14.0

### Minor Changes

- 57cd798: Make Sphinx non-upgradeable
- ac40b0b: Require that proposers are approved by the project owner

### Patch Changes

- 27cb63b: Remove meta upgrade tests
- 1c5e99a: Add support for async config files
- c43c960: Add input validation for config variables
- ea4bc1e: Add a protocol fee to be collected during execution
- 41f420c: Allow function types in contracts
- 06c9af9: Only initialize Sphinx on local networks
- e2392ad: Update remoteExecution parameter to only be true when proposing on a live network
- c309331: Add organization ID
- b5f5268: Display Sphinx errors and warnings by default when running Hardhat tests
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
- 11fd15c: Make sphinx-deploy task execute locally by default
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
  - @sphinx-labs/core@0.9.0
  - @sphinx-labs/contracts@0.7.0

## 0.13.0

### Minor Changes

- 3da5ee8: Add meta upgrades to SphinxRegistry

### Patch Changes

- 3e923a0: Change implementation salt and skip deploying implementation if it's already been deployed
- 22c24d2: Add support for parallel execution
- 35c7a63: Add meta upgrades for root SphinxManager
- Updated dependencies [3b382d9]
- Updated dependencies [3da5ee8]
- Updated dependencies [ecef09e]
- Updated dependencies [3e923a0]
- Updated dependencies [c76142e]
- Updated dependencies [22c24d2]
- Updated dependencies [35c7a63]
  - @sphinx-labs/core@0.8.0
  - @sphinx-labs/contracts@0.6.0
  - @sphinx-labs/executor@0.8.0

## 0.12.0

### Minor Changes

- 9dca319: Integrate Executor with Sphinx Managed

### Patch Changes

- 5dcb7d3: Allow user to specify a previous storage layout in their Sphinx file
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
  - @sphinx-labs/core@0.7.0
  - @sphinx-labs/contracts@0.5.2
  - @sphinx-labs/executor@0.7.0

## 0.11.1

### Patch Changes

- d30ebdf: Change the task for displaying bundles into a script
- ca6d384: Bump contracts
- Updated dependencies [ca6d384]
  - @sphinx-labs/contracts@0.5.1
  - @sphinx-labs/core@0.6.1
  - @sphinx-labs/executor@0.6.1

## 0.11.0

### Minor Changes

- fa3f420: Add support for UUPS proxies

### Patch Changes

- 04dba20: Update fund task to optionally automatically calculate the amount of funds to send
- 5c6846e: Remove hard-coded chain id 31337
- 07860e6: Add internal task for displaying bundles
- 5ffd3cc: Fix issue where Sphinx not initialized when executing locally
- 1a22e72: Make OpenZeppelin proxy addresses consistent in tests
- a9d3337: Fix bug where Hardhat chain ID wasn't being detected on localhost
- Updated dependencies [a76efad]
- Updated dependencies [3b13db4]
- Updated dependencies [04dba20]
- Updated dependencies [5c6846e]
- Updated dependencies [263b34d]
- Updated dependencies [fa3f420]
- Updated dependencies [57a327d]
  - @sphinx-labs/executor@0.6.0
  - @sphinx-labs/core@0.6.0
  - @sphinx-labs/contracts@0.5.0

## 0.10.7

### Patch Changes

- c30b8ef: Fix bug caused by logic that gets the minimum compiler input for a bundle
- Updated dependencies [c30b8ef]
- Updated dependencies [90e5c0b]
  - @sphinx-labs/core@0.5.6

## 0.10.6

### Patch Changes

- 2caf51e: Change minimum compiler input logic to fix bug that generated incomplete inputs
- Updated dependencies [2caf51e]
  - @sphinx-labs/executor@0.5.5
  - @sphinx-labs/core@0.5.5

## 0.10.5

### Patch Changes

- fd98872: Update demo package to reflect latest `getContract` function

## 0.10.4

### Patch Changes

- 4cf40e5: Bump plugins and executor versions
- Updated dependencies [4cf40e5]
  - @sphinx-labs/executor@0.5.4

## 0.10.3

### Patch Changes

- ecfe984: Bump core and plugins versions
- Updated dependencies [ecfe984]
  - @sphinx-labs/core@0.5.3

## 0.10.2

### Patch Changes

- 94d65b9: Bump plugins package version

## 0.10.1

### Patch Changes

- e07b90c: Allow user to explicitly define proxy type in Sphinx file
- Updated dependencies [4265ae4]
- Updated dependencies [4554d0c]
- Updated dependencies [591e7da]
- Updated dependencies [e56b684]
- Updated dependencies [a892f24]
- Updated dependencies [fd70a56]
  - @sphinx-labs/contracts@0.4.3
  - @sphinx-labs/core@0.5.1

## 0.10.0

### Minor Changes

- b47a7e5: Merge in Sphinx Foundry Library
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
  - @sphinx-labs/core@0.5.0
  - @sphinx-labs/executor@0.5.3
  - @sphinx-labs/contracts@0.4.2

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
  - @sphinx-labs/core@0.4.0
  - @sphinx-labs/executor@0.5.0
  - @sphinx-labs/contracts@0.4.0

## 0.8.9

### Patch Changes

- 2267ec4: Bump versions
- Updated dependencies [2267ec4]
  - @sphinx-labs/contracts@0.3.17
  - @sphinx-labs/core@0.3.24
  - @sphinx-labs/executor@0.4.14

## 0.8.8

### Patch Changes

- b70b268: Fix sphinx-init bug where task attempted to copy from non-existent file
- ea1b6d4: Make '@nomiclabs/hardhat-ethers' a dependency instead of devDependency

## 0.8.7

### Patch Changes

- d6984ec: Override transaction gas prices to use EIP-1559 if supported by the network
- Updated dependencies [7cd5e1b]
- Updated dependencies [d6984ec]
- Updated dependencies [532d586]
  - @sphinx-labs/executor@0.4.13
  - @sphinx-labs/core@0.3.23

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
  - @sphinx-labs/contracts@0.3.16
  - @sphinx-labs/core@0.3.22
  - @sphinx-labs/executor@0.4.12

## 0.8.5

### Patch Changes

- a3664d7: Add SimpleStorage contract to plugins
- bb241f5: Update tutorial to use UserSphinxConfig
- d843707: Expand test coverage to include contract references
- baf3ac1: Changes contract reference syntax from '!Ref' to '{{ }}'
- 89cd352: feat(core): support bytes/strings (length >31)
- dba31f7: Write canonical config to file system when using executing bundles locally
- 4c04d0a: Add sphinx-init Hardhat task
- c9eeb47: Make configPath a normal parameter on all tasks
- Updated dependencies [74a61c0]
- Updated dependencies [2dbf187]
- Updated dependencies [3ec7a05]
- Updated dependencies [baf3ac1]
- Updated dependencies [89cd352]
- Updated dependencies [dba31f7]
- Updated dependencies [c9eeb47]
  - @sphinx-labs/contracts@0.3.15
  - @sphinx-labs/core@0.3.21
  - @sphinx-labs/executor@0.4.11

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
  - @sphinx-labs/contracts@0.3.14
  - @sphinx-labs/core@0.3.20
  - @sphinx-labs/executor@0.4.10

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
  - @sphinx-labs/core@0.3.19
  - @sphinx-labs/executor@0.4.9
  - @sphinx-labs/contracts@0.3.13

## 0.8.2

### Patch Changes

- e105ea9: Updates Hardhat tasks to reflect proposer/owner requirement
- Updated dependencies [40c7bfb]
- Updated dependencies [e105ea9]
  - @sphinx-labs/contracts@0.3.12
  - @sphinx-labs/core@0.3.18

## 0.8.1

### Patch Changes

- d7fff20: Several improvements / bug fixes discovered when deploying on Optimism's devnet.
- 4eef7fb: Changed the deployment folder name to match hardhat-deploy
- 7e8dd1e: Removes the projectOwner from the Sphinx config
- f62dfea: Modify sphinx-cancel so that it does not retrieve the bundle ID before cancelling
- bd87e8c: Filter empty Sphinx configs in `getContract`
- d12922d: Remove 'silent' flag from the sphinx-cancel task
- Updated dependencies [d7fff20]
- Updated dependencies [b1850ad]
- Updated dependencies [7e8dd1e]
- Updated dependencies [e1dc2ec]
- Updated dependencies [da79232]
  - @sphinx-labs/contracts@0.3.11
  - @sphinx-labs/core@0.3.17
  - @sphinx-labs/executor@0.4.8

## 0.8.0

### Minor Changes

- ee3ae13: Use executor automatically when deploying against local networks

### Patch Changes

- af5e5ca: Expands storage variable test coverage
- 74da4d0: Simplify storage slot encoding logic
- 7a1737e: Separate config type into UserSphinxConfig and ParsedSphinxConfig
- eba1399: Remove the test-remote-execution task
- e757d65: Throw an error if user attempts to fund a project that hasn't been registered
- c32f23e: Add basic support for upgrades
- fd5177e: Add sphinx-list-projects Hardhat task
- 0b52005: Remove redundant Proxy verification attempts. Link SphinxManager proxy with its implementation on Etherscan.
- e1af6e3: Merge deploy and upgrade tasks
- 3572abd: Batch SetStorage actions into large transactions to speed up execution
- ec87d11: Fixes bug where signed integers were encoded as unsigned integers
- ae89911: Add user logs for the commit subtask
- f1e6f8c: Disable Sphinx by default in the Hardhat "run" task
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
- 3507e4b: Add a sphinx-withdraw task to withdraw project owner funds from projects
- fc8cfd3: Remove progress bar in execution-related Hardhat tasks
- f217221: Use the executor to deploy and verify the Sphinx predeployed contracts
- 8478b24: Add a sphinx-cancel Hardhat task to cancel active bundles
- 05a7bb4: Add noCompile flag to relevant Hardhat tasks
- a1ae30f: Make language in the user logs neutral to deployments/upgrades.
- da5cb35: Move the logic that initializes the Sphinx predeploys into the executor.
- 5406b7b: Update canonical Sphinx config type usage
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
  - @sphinx-labs/core@0.3.16
  - @sphinx-labs/executor@0.4.7
  - @sphinx-labs/contracts@0.3.10

## 0.7.0

### Minor Changes

- 3d1ca28: Add Hardhat task to explicitly fund deployments
- cf7751d: Add sphinx-status Hardhat task to monitor remote deployments

### Patch Changes

- ac04198: Improve error handling in sphinx-approve task
- 162cfb7: Fix bug parsing build info metadata
- 7c367b4: Updates the sphinx-execute task
- 457b19a: Improve sphinx-deploy hardhat task
- Updated dependencies [ed7babc]
- Updated dependencies [457b19a]
  - @sphinx-labs/contracts@0.3.9
  - @sphinx-labs/core@0.3.15

## 0.6.0

### Minor Changes

- 8323afb: Add deployment artifact generation on the user's side

### Patch Changes

- Updated dependencies [8323afb]
  - @sphinx-labs/core@0.3.14

## 0.5.14

### Patch Changes

- 15ebe78: Hardhat task bug fixes and improvements
- Updated dependencies [15ebe78]
  - @sphinx-labs/core@0.3.13

## 0.5.13

### Patch Changes

- b653177: Remove parallel deployments due to bug on live networks

## 0.5.12

### Patch Changes

- ecafe45: Refactor sphinx-commit and sphinx-load subtasks
- d0a9f15: Update plugins README
- 34078c6: Add a script that publishes local deployments to IPFS
- e862925: Remove local flag
- a43e0e3: Add Docker configuration for executor
- 12a7f34: Improve execution speed with parallelization
- Updated dependencies [ecafe45]
  - @sphinx-labs/core@0.3.12

## 0.5.11

### Patch Changes

- 3c939bd: Refactor remote bundling logic
- 7b33791: Integrate etherscan verification into executor
- 6941e89: Remove spinner from subtasks. Also update sphinx-propose task to be more descriptive and robust.
- 9d38797: Update sphinx-register task to work locally
- Updated dependencies [6a6f0c0]
- Updated dependencies [9d38797]
  - @sphinx-labs/contracts@0.3.8
  - @sphinx-labs/core@0.3.11

## 0.5.10

### Patch Changes

- c84eb6c: Update deployment artifacts to be hardhat-deploy compatible
- a50e15b: Filter unnecessary artifacts that were being committed to IPFS
- 5ce19b6: Replace spinner in sphinx-deploy task due to clash with Hardhat's logs
- 071d867: Implemented minimal standalone executor
- c6485b2: Resolve type issues with sphinx-execute command
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
  - @sphinx-labs/contracts@0.3.7
  - @sphinx-labs/core@0.3.10

## 0.5.9

### Patch Changes

- 5ad574b: Fixes a bug that would break deterministic deployment on non-hardhat networks
- Updated dependencies [062a439]
  - @sphinx-labs/core@0.3.9

## 0.5.8

### Patch Changes

- c5e2472: Change getChainId call from hardhat-deploy to eth-optimism
- 5e74723: Add support for mappings
- 138f0cd: Small bug fixes for immutable handling
- Updated dependencies [5e74723]
  - @sphinx-labs/core@0.3.8

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
  - @sphinx-labs/core@0.3.7

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
  - @sphinx-labs/core@0.3.6

## 0.5.3

### Patch Changes

- 6cb309d: Bump versions

## 0.5.2

### Patch Changes

- 3b3ae5a: Separate Hardhat in-process network from localhost to improve testing deployments
- dc88439: Improved error handling in deployment task
- Updated dependencies [3b3ae5a]
- Updated dependencies [dc88439]
  - @sphinx-labs/core@0.3.5

## 0.5.1

### Patch Changes

- 8ccbe35: Bump plugins and demo packages

## 0.5.0

### Minor Changes

- 123d9c1: Add support for deployments on live networks

### Patch Changes

- Updated dependencies [123d9c1]
  - @sphinx-labs/contracts@0.3.5
  - @sphinx-labs/core@0.3.4

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
  - @sphinx-labs/core@0.3.3
  - @sphinx-labs/contracts@0.3.3

## 0.4.2

### Patch Changes

- 03d557c: Bump all versions
- Updated dependencies [03d557c]
  - @sphinx-labs/contracts@0.3.2
  - @sphinx-labs/core@0.3.2

## 0.4.1

### Patch Changes

- 557e3bd: Bump versions
- Updated dependencies [557e3bd]
- Updated dependencies [cd310fe]
  - @sphinx-labs/contracts@0.3.1
  - @sphinx-labs/core@0.3.1

## 0.4.0

### Minor Changes

- 52c7f6c: Bump all packages

### Patch Changes

- Updated dependencies [52c7f6c]
  - @sphinx-labs/contracts@0.3.0
  - @sphinx-labs/core@0.3.0

## 0.3.1

### Patch Changes

- f7a4a24: Bump versions of core and plugins packages
- f7a4a24: Bump core and plugins packages
- Updated dependencies [f7a4a24]
- Updated dependencies [f7a4a24]
  - @sphinx-labs/core@0.2.1

## 0.3.0

### Minor Changes

- 19cf359: Adds local Sphinx deployments for testing contracts on the Hardhat network.

### Patch Changes

- Updated dependencies [416d41b]
- Updated dependencies [19cf359]
- Updated dependencies [53e1514]
  - @sphinx-labs/contracts@0.2.0
  - @sphinx-labs/core@0.2.0

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
  - @sphinx-labs/contracts@0.2.0
  - @sphinx-labs/core@0.1.1

## 0.1.2

### Patch Changes

- a6ed94e: Adds Hardhat tasks for creating, listing, and approving Sphinx projects
- 310dfd9: Adds some nice spinners to hardhat tasks
- a6bc8f6: Makes a few small changes to SphinxRegistry (e.g. missing event) and removes leftover SphinxManager TS interface vars
- e5fe498: Brings back the SphinxManager contract
- Updated dependencies [6403ed2]
- Updated dependencies [e5fe498]
  - @sphinx-labs/contracts@0.1.1
