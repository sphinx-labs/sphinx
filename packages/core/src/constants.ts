import { utils } from 'ethers'
import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'

export const CONTRACT_SIZE_LIMIT = 24576 // bytes

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

export const CALLER_ROLE = utils.keccak256(utils.toUtf8Bytes('CALLER_ROLE'))

export const MANAGED_PROPOSER_ROLE = utils.keccak256(
  utils.toUtf8Bytes('MANAGED_PROPOSER_ROLE')
)

export const CURRENT_CHUGSPLASH_MANAGER_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
}
