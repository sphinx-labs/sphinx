import { BigNumber, ethers } from 'ethers'

import { Integration } from '../constants'

export const resolveNetworkName = async (
  provider: ethers.providers.Provider,
  integration: Integration
) => {
  const { name: networkName } = await provider.getNetwork()
  if (networkName === 'unknown') {
    if (integration === 'hardhat') {
      return 'hardhat'
    } else if (integration === 'foundry') {
      return 'anvil'
    }
  }
  return networkName
}

export const errorProjectNotClaimed = async (
  provider: ethers.providers.JsonRpcProvider,
  configPath: string,
  integration: Integration
) => {
  const networkName = await resolveNetworkName(provider, integration)

  if (integration === 'hardhat') {
    throw new Error(`This project has not been claimed on ${networkName}.
To claim the project on this network, run the following command:

npx hardhat chugsplash-claim --network <network> --owner <ownerAddress> --config-path ${configPath}
  `)
  } else {
    throw new Error(`This project has not been claimed on ${networkName}.
To claim the project on this network, call the claim function from your script:

chugsplash.finalizeRegistration("${configPath}");
`)
  }
}

export const successfulProposalMessage = async (
  provider: ethers.providers.JsonRpcProvider,
  amount: BigNumber,
  configPath: string,
  integration: Integration
): Promise<string> => {
  const networkName = await resolveNetworkName(provider, integration)

  if (amount.gt(0)) {
    return `Project successfully proposed on ${networkName}. You can now fund and approve the deployment via the UI.`
  } else {
    return `Project successfully proposed and funded on ${networkName}. You can now approve the deployment via the UI.`
  }
}

export const alreadyProposedMessage = async (
  provider: ethers.providers.JsonRpcProvider,
  amount: BigNumber,
  configPath: string,
  integration: Integration
): Promise<string> => {
  const networkName = await resolveNetworkName(provider, integration)

  if (amount.gt(0)) {
    return `Project has already been proposed on ${networkName}. Fund and approve the deployment via the UI.`
  } else {
    return `Project has already been proposed and funded on ${networkName}. Approve the deployment via the UI.`
  }
}
