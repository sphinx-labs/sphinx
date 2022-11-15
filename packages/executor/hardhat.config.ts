// We use hardhat for compiling Solidity contracts. We could use other tools for doing this
// compilation, but hardhat was a simple solution. We should probably replace this with a simpler
// solution later and put the compilation function in @chugsplash/core.

import { HardhatUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'

// Load environment variables from .env
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
  },
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 1000,
      },
    },
    'optimism-goerli': {
      chainId: 420,
      url: `https://optimism-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    goerli: {
      chainId: 5,
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      optimisticGoerli: process.env.OPT_ETHERSCAN_API_KEY
        ? process.env.OPT_ETHERSCAN_API_KEY
        : '',
      goerli: process.env.ETH_ETHERSCAN_API_KEY
        ? process.env.ETH_ETHERSCAN_API_KEY
        : '',
    },
    customChains: [
      {
        network: 'optimisticGoerli',
        chainId: 420,
        urls: {
          apiURL: 'https://api-goerli-optimism.etherscan.io/api',
          browserURL: 'https://goerli-optimism.etherscan.io',
        },
      },
    ],
  },
}

export default config
