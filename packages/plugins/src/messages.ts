import { BigNumber } from 'ethers'

export const errorProjectNotRegistered = (
  chainId: number,
  networkName: string,
  configPath: string
) => {
  throw new Error(`This project has not been registered on ${networkName}.
To register the project on this network, run the following command:

npx hardhat chugsplash-register --network ${networkName} --owner <ownerAddress> --config-path ${configPath}
  `)
}

export const successfulProposalMessage = (
  amount: BigNumber,
  configPath: string,
  networkName: string
): string => {
  if (amount.gt(0)) {
    return `Project successfully proposed on ${networkName}. Fund and approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --amount ${amount} --config-path ${configPath}`
  } else {
    return `Project successfully proposed and funded on ${networkName}. Approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --config-path ${configPath}`
  }
}

export const alreadyProposedMessage = (
  amount: BigNumber,
  configPath: string,
  networkName: string
): string => {
  if (amount.gt(0)) {
    return `Project has already been proposed on ${networkName}. Fund and approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --amount ${amount} --config-path ${configPath}`
  } else {
    return `Project has already been proposed and funded on ${networkName}. Approve the deployment using the command:

npx hardhat chugsplash-approve --network ${networkName} --config-path ${configPath}`
  }
}
