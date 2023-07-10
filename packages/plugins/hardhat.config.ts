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
      // TODO: undo
      url: `http://localhost:8545`,
      // url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    ethereum: {
      chainId: 1,
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    'optimism-goerli': {
      chainId: 420,
      url: 'http://localhost:8546',
      // url: `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    optimism: {
      chainId: 10,
      url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    arbitrum: {
      chainId: 42161,
      url: 'https://arb1.arbitrum.io/rpc',
      accounts,
    },
    'arbitrum-goerli': {
      chainId: 421613,
      url: `https://arb-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
  },
  mocha: {
    timeout: 999_999_999,
  },
}

export default config
