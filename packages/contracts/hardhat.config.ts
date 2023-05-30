import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'

// Load environment variables from .env
dotenv.config()

const config: HardhatUserConfig = {
  // TODO: rm this in all hardhat configs, and anvil --code-size
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
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
