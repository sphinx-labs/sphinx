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
    // goerli: {
    //   chainId: 5,
    //   url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // 'optimism-goerli': {
    //   chainId: 420,
    //   url: `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // 'arbitrum-goerli': {
    //   chainId: 421613,
    //   url: `https://arb-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // bnbt: {
    //   chainId: 97,
    //   url: `https://young-wandering-energy.bsc-testnet.discover.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
    //   accounts,
    // },
    // 'gnosis-chiado': {
    //   chainId: 10200,
    //   url: `https://rpc.chiadochain.net`,
    //   accounts,
    // },
    // maticmum: {
    //   chainId: 80001,
    //   url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },

    goerli: {
      chainId: 5,
      url: 'http://127.0.0.1:42005',
      accounts,
    },
    'optimism-goerli': {
      chainId: 420,
      url: 'http://127.0.0.1:42420',
      accounts,
    },
    'arbitrum-goerli': {
      chainId: 421613,
      url: 'http://127.0.0.1:42613',
      accounts,
    },
    'gnosis-chiado': {
      chainId: 10200,
      url: 'http://127.0.0.1:42102',
      accounts,
    },
    bnbt: {
      chainId: 97,
      url: 'http://127.0.0.1:42097',
      accounts,
    },
    maticmum: {
      chainId: 80001,
      url: 'http://127.0.0.1:42001',
      accounts,
    },

    ethereum: {
      chainId: 1,
      url: 'http://127.0.0.1:10001',
      accounts,
    },
    optimism: {
      chainId: 10,
      url: 'http://127.0.0.1:10010',
      accounts,
    },
    arbitrum: {
      chainId: 42161,
      url: 'http://127.0.0.1:10161',
      accounts,
    },
    gnosis: {
      chainId: 100,
      url: 'http://127.0.0.1:10100',
      accounts,
    },
    bnb: {
      chainId: 56,
      url: 'http://127.0.0.1:10056',
      accounts,
    },
    polygon: {
      chainId: 137,
      url: 'http://127.0.0.1:10137',
      accounts,
    },
  },
  mocha: {
    timeout: 999_999_999,
  },
}

export default config
