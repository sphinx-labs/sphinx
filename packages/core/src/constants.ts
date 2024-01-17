import { ChainConfig } from '@nomicfoundation/hardhat-verify/types'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts/dist/networks'
import { ethers } from 'ethers'

export const WEBSITE_URL = `https://sphinx.dev`

// Etherscan constants
export const customChains: ChainConfig[] = SPHINX_NETWORKS.map((network) => {
  return {
    network: network.name,
    chainId: Number(network.chainId),
    urls: {
      apiURL: network.etherscan.apiURL,
      browserURL: network.etherscan.browserURL,
    },
  }
})

export type Integration = 'hardhat' | 'foundry'

export const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('RELAYER_ROLE'))

export enum ExecutionMode {
  LocalNetworkCLI,
  LiveNetworkCLI,
  Platform,
}
