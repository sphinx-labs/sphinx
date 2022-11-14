import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import './dist'

// Load environment variables from .env
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
    settings: {
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    },
  },
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 1000,
      },
    },
    localhost: {
      url: 'http://localhost:8545',
      mining: {
        auto: false,
        interval: 1000,
      },
    },
    goerli: {
      chainId: 5,
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    'optimism-goerli': {
      chainId: 420,
      url: `https://optimism-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    optimism: {
      chainId: 10,
      url: `https://optimism-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    arbitrum: {
      chainId: 42161,
      url: 'https://arb1.arbitrum.io/rpc',
      accounts,
    },
    'arbitrum-goerli': {
      chainId: 421613,
      url: 'https://goerli-rollup.arbitrum.io/rpc',
      accounts,
    },
  },
}

export default config
