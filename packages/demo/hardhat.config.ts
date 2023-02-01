import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import '@chugsplash/plugins'

// Load environment variables from .env
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    },
  },
  networks: {
    localhost: {
      accounts: [
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      ],
    },
    goerli: {
      chainId: 5,
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    ethereum: {
      chainId: 1,
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    'optimism-goerli': {
      chainId: 420,
      url: `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
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
}

export default config
