import { ethers } from 'ethers'

import { Integration } from '../constants'
import { SUPPORTED_NETWORKS } from '../networks'

export const resolveNetworkName = async (
  provider: ethers.providers.Provider,
  isLocalNetwork: boolean,
  integration: Integration
) => {
  if (isLocalNetwork) {
    if (integration === 'hardhat') {
      return 'hardhat'
    } else if (integration === 'foundry') {
      return 'anvil'
    } else {
      throw new Error('Unknown integration. Should never happen.')
    }
  }

  const { chainId, name: networkName } = await provider.getNetwork()
  if (networkName !== 'unknown') {
    return networkName
  } else {
    const supportedNetwork = Object.entries(SUPPORTED_NETWORKS).find(
      ([, supportedChainId]) => supportedChainId === chainId
    )
    if (supportedNetwork) {
      return supportedNetwork[0]
    } else {
      throw new Error(
        `Unsupported network ${networkName} with chainId ${chainId}`
      )
    }
  }
}
