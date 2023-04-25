import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'

// Load environment variables from .env
dotenv.config()

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
    settings: {
      optimizer: {
        enabled: true,
        runs: 100,
      },
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
}

export default config
