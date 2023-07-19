import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import './dist'

// Load environment variables from .env
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []

const config: HardhatUserConfig = {
  paths: {
    sources: './contracts/test',
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
    goerli: {
      chainId: 5,
      url: 'http://localhost:42005',
      accounts,
    },
    ethereum: {
      chainId: 1,
      url: 'http://localhost:42001',
      accounts,
    },
    'optimism-goerli': {
      chainId: 420,
      url: 'http://localhost:42420',
      accounts,
    },
    optimism: {
      chainId: 10,
      url: 'http://localhost:42010',
      accounts,
    },
    arbitrum: {
      chainId: 42161,
      url: 'http://localhost:42161',
      accounts,
    },
    'arbitrum-goerli': {
      chainId: 421613,
      url: 'http://localhost:42613',
      accounts,
    },
  },
  mocha: {
    timeout: 999_999_999,
  },
}

export default config
