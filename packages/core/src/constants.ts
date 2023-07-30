import { utils } from 'ethers'
import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'

export const CONTRACT_SIZE_LIMIT = 24576 // bytes

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
]

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

export const RELAYER_ROLE = utils.keccak256(utils.toUtf8Bytes('RELAYER_ROLE'))

export const FUNDER_ROLE = utils.keccak256(utils.toUtf8Bytes('FUNDER_ROLE'))

export const CURRENT_SPHINX_MANAGER_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
}

export const REFERENCE_ORG_ID = 'reference-org-id'
