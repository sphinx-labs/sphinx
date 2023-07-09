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

export const LAYERZERO_ADDRESSES: {
  [K in SupportedChainId]: {
    endpointAddress: string
    relayerV2Address: string
    lzChainId: number
  }
} = {
  1: {
    endpointAddress: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    relayerV2Address: '0x902F09715B6303d4173037652FA7377e5b98089E',
    lzChainId: 101,
  },
  10: {
    endpointAddress: '0x3c2269811836af69497E5F486A85D7316753cf62',
    relayerV2Address: '0x81E792e5a9003CC1C8BF5569A00f34b65d75b017',
    lzChainId: 111,
  },
  5: {
    endpointAddress: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    relayerV2Address: '0xA658742d33ebd2ce2F0bdFf73515Aa797Fd161D9',
    lzChainId: 10121,
  },
  420: {
    endpointAddress: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    relayerV2Address: '0x7F417F2192B89Cf93b8c4Ee01d558883A0AD7B47',
    lzChainId: 10132,
  },
}
