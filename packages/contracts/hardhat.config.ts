import { HardhatUserConfig } from 'hardhat/types'
import { getenv } from '@eth-optimism/core-utils'
import * as dotenv from 'dotenv'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import 'hardhat-deploy'

// Load environment variables from .env
dotenv.config()

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
  },
  networks: {
    optimism: {
      chainId: 10,
      url: 'https://mainnet.optimism.io',
      verify: {
        etherscan: {
          apiKey: getenv('OPTIMISTIC_ETHERSCAN_API_KEY'),
        },
      },
    },
    'optimism-kovan': {
      chainId: 69,
      url: 'https://kovan.optimism.io',
      verify: {
        etherscan: {
          apiKey: getenv('OPTIMISTIC_ETHERSCAN_API_KEY'),
        },
      },
    },
    ethereum: {
      chainId: 1,
      url: `https://mainnet.infura.io/v3/${getenv('INFURA_PROJECT_ID')}`,
      verify: {
        etherscan: {
          apiKey: getenv('ETHEREUM_ETHERSCAN_API_KEY'),
        },
      },
    },
    goerli: {
      chainId: 5,
      url: `https://goerli.infura.io/v3/${getenv('INFURA_PROJECT_ID')}`,
      verify: {
        etherscan: {
          apiKey: getenv('ETHEREUM_ETHERSCAN_API_KEY'),
        },
      },
    },
    rinkeby: {
      chainId: 4,
      url: `https://rinkeby.infura.io/v3/${getenv('INFURA_PROJECT_ID')}`,
      verify: {
        etherscan: {
          apiKey: getenv('ETHEREUM_ETHERSCAN_API_KEY'),
        },
      },
    },
    ropsten: {
      chainId: 3,
      url: `https://ropsten.infura.io/v3/${getenv('INFURA_PROJECT_ID')}`,
      verify: {
        etherscan: {
          apiKey: getenv('ETHEREUM_ETHERSCAN_API_KEY'),
        },
      },
    },
    kovan: {
      chainId: 42,
      url: `https://kovan.infura.io/v3/${getenv('INFURA_PROJECT_ID')}`,
      verify: {
        etherscan: {
          apiKey: getenv('ETHEREUM_ETHERSCAN_API_KEY'),
        },
      },
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
}

export default config
