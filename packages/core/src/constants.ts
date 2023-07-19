import { utils } from 'ethers'
import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'

import { SupportedMainnetChainId, SupportedTestnetChainId } from './networks'

export const CONTRACT_SIZE_LIMIT = 24576 // bytes

export const WEBSITE_URL = `https://sphinx.dev`

// Maps a live network name to its chain ID. Does not include testnets.
export const SUPPORTED_MAINNETS: {
  [networkName: string]: SupportedMainnetChainId
} = {
  mainnet: 1,
  optimism: 10,
  arbitrum: 42161,
}
export const SUPPORTED_TESTNETS: {
  [networkName: string]: SupportedTestnetChainId
} = {
  goerli: 5,
  'optimism-goerli': 420,
  'arbitrum-goerli': 421613,
  'gnosis-chiado': 10200,
}
export const SUPPORTED_NETWORKS = {
  ...SUPPORTED_MAINNETS,
  ...SUPPORTED_TESTNETS,
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

export const CURRENT_SPHINX_MANAGER_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
}
