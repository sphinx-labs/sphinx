import { utils } from 'ethers'
import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'

export const CONTRACT_SIZE_LIMIT = 24576 // bytes

export const WEBSITE_URL = `https://sphinx.dev`

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

export const FUNDER_ROLE = utils.keccak256(utils.toUtf8Bytes('FUNDER_ROLE'))

export const CURRENT_SPHINX_MANAGER_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
}

export const REFERENCE_ORG_ID = 'reference-org-id'

// Maps a chain ID to the USDC address on the network.
export const USDC_ADDRESSES: { [chainId: string]: string } = {
  // Optimism Goerli:
  420: '0x7E07E15D2a87A24492740D16f5bdF58c16db0c4E',
  // Optimism Mainnet:
  10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
}
