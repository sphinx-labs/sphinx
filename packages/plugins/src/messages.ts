import { BigNumber } from 'ethers'

export const errorProjectNotRegistered = (
  chainId: number,
  networkName: string,
  configPath: string
) => {
  if (chainId === 31337) {
    throw new Error(`This project has not been registered on ${networkName}. To register the project on this network, run the following command:

  npx hardhat chugsplash-register --network ${networkName} ${configPath}
  `)
  } else {
    throw new Error(`This project has not been registered on the local Hardhat network. You can register the project locally with the following commands:

  npx hardhat node --setup-internals
  npx hardhat chugsplash-register --network localhost ${configPath}
  `)
  }
}

export const successfulProposalMessage = (
  amount: BigNumber,
  configPath: string,
  networkName: string
): string => {
  if (amount.gt(0)) {
    return `Project successfully proposed on ${networkName}. Next, fund the deployment using the command:

  npx hardhat fund --network ${networkName} --amount ${amount} ${configPath}`
  } else {
    return `Project successfully proposed and funded on ${networkName}. Approve the deployment using the command:

  npx hardhat chugsplash-approve --network ${networkName} ${configPath}`
  }
}

export const alreadyProposedMessage = (
  amount: BigNumber,
  configPath: string,
  networkName: string
): string => {
  if (amount.gt(0)) {
    return `Project has already been proposed on ${networkName}. You must fund the deployment using the command:

  npx hardhat fund --network ${networkName} --amount ${amount} ${configPath}`
  } else {
    return `Project has already been proposed and funded on ${networkName}. Approve the deployment using the command:

  npx hardhat chugsplash-approve --network ${networkName} ${configPath}`
  }
}
