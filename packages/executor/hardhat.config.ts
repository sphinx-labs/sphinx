import { HardhatUserConfig } from 'hardhat/types'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import '@chugsplash/plugins'

const config: HardhatUserConfig = {
  mocha: {
    timeout: 160000,
  },
  solidity: {
    version: '0.8.15',
    settings: {
      outputSelection: {
        '*': {
          '*': ['storageLayout', 'evm.gasEstimates'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
  networks: {
    hardhat: {
      // This must be the chain ID of a live network that ChugSplash supports. This allows us to
      // test the remote executor against an org config, which can only contain supported live
      // networks. For a list of supported networks, see the `SUPPORTED_NETWORKS` object in the
      // `@chugsplash/core` package.
      chainId: 5,
    },
  },
}

export default config
