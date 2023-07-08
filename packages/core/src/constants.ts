import { utils } from 'ethers'
import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'

export const CONTRACT_SIZE_LIMIT = 24576 // bytes

export const WEBSITE_URL = `https://chugsplash.io`

export type SupportedChainId = 1 | 10 | 5 | 420

// Maps a live network name to its chain ID
export const SUPPORTED_LIVE_NETWORKS: {
  [networkName: string]: SupportedChainId
} = {
  // Mainnets
  mainnet: 1,
  optimism: 10,
  // Testnets
  goerli: 5,
  'optimism-goerli': 420,
}

// Etherscan constants
export const customChains: CustomChain[] = []

export const EXECUTION_BUFFER_MULTIPLIER = 2
export type Integration = 'hardhat' | 'foundry'

export type Keyword = '{preserve}' | '{gap}'
type Keywords = {
  preserve: Keyword
  gap: Keyword
}

export const keywords: Keywords = {
  preserve: '{preserve}',
  gap: '{gap}',
}

export const REMOTE_EXECUTOR_ROLE = utils.keccak256(
  utils.toUtf8Bytes('REMOTE_EXECUTOR_ROLE')
)

export const PROTOCOL_PAYMENT_RECIPIENT_ROLE = utils.keccak256(
  utils.toUtf8Bytes('PROTOCOL_PAYMENT_RECIPIENT_ROLE')
)

export const CURRENT_CHUGSPLASH_MANAGER_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
}

export const LAYERZERO_ENDPOINT_ADDRESSES: {
  [K in SupportedChainId]: { address: string; lzChainId: number }
} = {
  1: {
    address: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    lzChainId: 101,
  },
  10: {
    address: '0x3c2269811836af69497E5F486A85D7316753cf62',
    lzChainId: 111,
  },
  5: {
    address: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    lzChainId: 10121,
  },
  420: {
    address: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    lzChainId: 10132,
  },
}
