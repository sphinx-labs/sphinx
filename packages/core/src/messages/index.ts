import { BigNumber } from 'ethers'

import { Integration } from '../constants'

export const resolveUnknownNetworkName = (
  networkName: string,
  integration: Integration
) => {
  if (networkName === 'unknown') {
    if (integration === 'hardhat') {
      networkName = 'hardhat'
    } else if (integration === 'foundry') {
      networkName = 'anvil'
    }
  }
  return networkName
}

export const errorProjectNotRegistered = (
  chainId: number,
  networkName: string,
  configPath: string,
  integration: Integration
) => {
  networkName = resolveUnknownNetworkName(networkName, integration)

  if (integration === 'hardhat') {
    throw new Error(`This project has not been registered on ${networkName}.
To register the project on this network, run the following command:

npx hardhat chugsplash-register --network ${networkName} --owner <ownerAddress> --config-path ${configPath}
  `)
  } else {
    // TODO - output foundry error
    throw new Error(`This project has not been registered on ${networkName}.
To register the project on this network...

TODO: Finish foundry success message`)
  }
}

export const successfulProposalMessage = (
  amount: BigNumber,
  configPath: string,
  networkName: string,
  integration: Integration
): string => {
  networkName = resolveUnknownNetworkName(networkName, integration)

  if (integration === 'hardhat') {
    if (amount.gt(0)) {
      return `Project successfully proposed on ${networkName}. Fund and approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --amount ${amount} --config-path ${configPath}`
    } else {
      return `Project successfully proposed and funded on ${networkName}. Approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --config-path ${configPath}`
    }
  } else {
    // TODO - output foundry error
    if (amount.gt(0)) {
      return `Project successfully proposed on ${networkName}. Fund and approve the deployment...

TODO: Finish foundry success message`
    } else {
      return `Project successfully proposed and funded on ${networkName}. Approve the deployment...

TODO: Finish foundry success message`
    }
  }
}

export const alreadyProposedMessage = (
  amount: BigNumber,
  configPath: string,
  networkName: string,
  integration: Integration
): string => {
  networkName = resolveUnknownNetworkName(networkName, integration)

  if (integration === 'hardhat') {
    if (amount.gt(0)) {
      return `Project has already been proposed on ${networkName}. Fund and approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --amount ${amount} --config-path ${configPath}`
    } else {
      return `Project has already been proposed and funded on ${networkName}. Approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --config-path ${configPath}`
    }
  } else {
    // TODO - output foundry error
    if (amount.gt(0)) {
      return `Project has already been proposed on ${networkName}. Fund and approve the deployment...

TODO: Finish foundry success message`
    } else {
      return `Project has already been proposed and funded on ${networkName}. Approve the deployment using the command:

TODO: Finish foundry success message`
    }
  }
}
