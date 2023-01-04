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
        runs: 10_000,
      },
    },
  },
}

export default config
