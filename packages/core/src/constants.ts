import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'
import { ethers } from 'ethers'

export const WEBSITE_URL = `https://sphinx.dev`

// Etherscan constants
export const customChains: CustomChain[] = [
  {
    network: 'gnosis-chiado',
    chainId: 10200,
    urls: {
      apiURL: 'https://gnosis-chiado.blockscout.com/api',
      browserURL: 'https://gnosis-chiado.blockscout.com',
    },
  },
  {
    network: 'linea-testnet',
    chainId: 59140,
    urls: {
      apiURL: 'https://api-goerli.lineascan.build/api',
      browserURL: 'https://goerli.lineascan.build',
    },
  },
  {
    network: 'linea',
    chainId: 59144,
    urls: {
      apiURL: 'https://api.lineascan.build/api',
      browserURL: 'https://lineascan.build',
    },
  },
  {
    network: 'polygon-zkevm-testnet',
    chainId: 1442,
    urls: {
      apiURL: 'https://api-testnet-zkevm.polygonscan.com/api',
      browserURL: 'https://testnet-zkevm.polygonscan.com',
    },
  },
  {
    network: 'polygon-zkevm',
    chainId: 1101,
    urls: {
      apiURL: 'https://api-zkevm.polygonscan.com/api',
      browserURL: 'https://zkevm.polygonscan.com',
    },
  },
  {
    network: 'base',
    chainId: 8453,
    urls: {
      apiURL: 'https://api.basescan.org/api',
      browserURL: 'https://basescan.org/',
    },
  },
  {
    network: 'base-goerli',
    chainId: 84531,
    urls: {
      apiURL: 'https://api-goerli.basescan.org/api',
      browserURL: 'https://goerli.basescan.org/',
    },
  },
  {
    network: 'base-sepolia',
    chainId: 84532,
    urls: {
      apiURL: 'https://api-base-sepolia.blockscout.com/api',
      browserURL: 'https://base-sepolia.blockscout.com/',
    },
  },
  {
    network: 'optimism-sepolia',
    chainId: 11155420,
    urls: {
      apiURL: 'https://api-sepolia-optimism.etherscan.io/api',
      browserURL: 'https://sepolia-optimism.etherscan.io/',
    },
  },
  {
    network: 'arbitrum-sepolia',
    chainId: 421614,
    urls: {
      apiURL: 'https://api-sepolia.arbiscan.io/api',
      browserURL: 'https://sepolia.arbiscan.io/',
    },
  },
  {
    network: 'sepolia',
    chainId: 11155111,
    urls: {
      apiURL: 'https://api-sepolia.etherscan.io/api',
      browserURL: 'https://sepolia.etherscan.io/',
    },
  },
]

export type Integration = 'hardhat' | 'foundry'

export const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('RELAYER_ROLE'))
