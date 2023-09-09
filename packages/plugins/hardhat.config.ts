import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'

// Hardhat plugins
import '@nomicfoundation/hardhat-ethers'
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
    },
  },
  networks: {
    hardhat: {
      chainId: 56,
    },
    goerli: {
      chainId: 5,
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    // ethereum: {
    //   chainId: 1,
    //   url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // 'optimism-goerli': {
    //   chainId: 420,
    //   url: `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // optimism: {
    //   chainId: 10,
    //   url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // arbitrum: {
    //   chainId: 42161,
    //   url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // 'arbitrum-goerli': {
    //   chainId: 421613,
    //   url: `https://arb-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // bnbt: {
    //   chainId: 97,
    //   url: `${process.env.BNB_TESTNET_URL}`,
    //   accounts,
    // },
    // bnb: {
    //   chainId: 56,
    //   url: `${process.env.BNB_MAINNET_URL}`,
    //   accounts,
    // },
    // 'gnosis-chiado': {
    //   chainId: 10200,
    //   url: `${process.env.CHIADO_RPC_URL}`,
    //   accounts,
    // },
    // gnosis: {
    //   chainId: 100,
    //   url: `${process.env.GNOSIS_MAINNET_URL}`,
    //   accounts,
    // },
    // maticmum: {
    //   chainId: 80001,
    //   url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // polygon: {
    //   chainId: 137,
    //   url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //   accounts,
    // },
    // 'polygon-zkevm': {
    //   chainId: 1101,
    //   url: `${process.env.POLYGON_ZKEVM_MAINNET_URL}`,
    //   accounts,
    // },
    // 'polygon-zkevm-testnet': {
    //   chainId: 1442,
    //   url: `${process.env.POLYGON_ZKEVM_TESTNET_URL}`,
    //   accounts,
    // },
    // linea: {
    //   chainId: 59144,
    //   url: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //   accounts,
    // },
    // 'linea-testnet': {
    //   chainId: 59140,
    //   url: `https://linea-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //   accounts,
    // },
    // 'fantom-testnet': {
    //   chainId: 4002,
    //   url: `${process.env.FANTOM_TESTNET_RPC_URL}`,
    //   accounts,
    // },
    // fantom: {
    //   chainId: 250,
    //   url: `${process.env.FANTOM_MAINNET_RPC_URL}`,
    //   accounts,
    // },
    // 'avalanche-fiji': {
    //   chainId: 43113,
    //   url: `https://avalanche-fuji.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //   accounts,
    // },
    // avalanche: {
    //   chainId: 43114,
    //   url: `https://avalanche-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //   accounts,
    // },
    // base: {
    //   chainId: 8453,
    //   url: `${process.env.BASE_MAINNET_URL}`,
    //   accounts,
    // },
    // 'base-goerli': {
    //   chainId: 84531,
    //   url: `${process.env.BASE_GOERLI_URL}`,
    //   accounts,
    // },

    // goerli: {TODO
    //   chainId: 5,
    //   url: 'http://127.0.0.1:42005',
    //   accounts,
    // },
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
      url: 'http://127.0.0.1:42200',
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
