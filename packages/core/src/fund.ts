import { OWNER_BOND_AMOUNT } from '@chugsplash/contracts'
import { ethers } from 'ethers'

import { getChugSplashManagerReadOnly, getDefaultProxyAddress } from './utils'
import {
  ChugSplashActionBundle,
  DeployImplementationAction,
  fromRawChugSplashAction,
  isDeployImplementationAction,
  isSetImplementationAction,
  isSetStorageAction,
} from './actions'
import { isContractDeployed } from './languages'
import { EXECUTION_BUFFER_MULTIPLIER } from './constants'

/**
 * Gets the amount ETH in the ChugSplashManager that can be used to execute a deployment. This
 * equals the ChugSplashManager's balance minus the total debt owed to executors minus the owner's
 * bond amount.
 */
export const availableFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  projectName: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManagerReadOnly(provider, projectName)

  const managerBalance = await provider.getBalance(ChugSplashManager.address)
  const totalDebt = await ChugSplashManager.totalDebt()
  return managerBalance.sub(totalDebt).sub(OWNER_BOND_AMOUNT)
}

export const getOwnerWithdrawableAmount = async (
  provider: ethers.providers.JsonRpcProvider,
  projectName: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManagerReadOnly(provider, projectName)

  if (
    (await ChugSplashManager.activeBundleId()) !== ethers.constants.HashZero
  ) {
    return ethers.BigNumber.from(0)
  }

  const managerBalance = await provider.getBalance(ChugSplashManager.address)
  const totalDebt = await ChugSplashManager.totalDebt()
  return managerBalance.sub(totalDebt)
}

export const estimateExecutionGas = async (
  provider: ethers.providers.JsonRpcProvider,
  bundle: ChugSplashActionBundle,
  actionsExecuted: number,
  projectName: string
): Promise<ethers.BigNumber> => {
  const actions = bundle.actions
    .map((action) => fromRawChugSplashAction(action.action))
    .slice(actionsExecuted)

  let estimatedGas = ethers.BigNumber.from(150_000).mul(
    actions.filter(
      (action) =>
        isSetImplementationAction(action) || isSetStorageAction(action)
    ).length
  )

  const deployedProxyPromises = actions
    .filter((action) => isDeployImplementationAction(action))
    .map(async (action) => {
      return (await isContractDeployed(
        getDefaultProxyAddress(projectName, action.target),
        provider
      ))
        ? ethers.BigNumber.from(0)
        : ethers.BigNumber.from(550_000)
    })

  const deployedImplementationPromises = actions
    .filter((action) => isDeployImplementationAction(action))
    .map(async (action: DeployImplementationAction) =>
      ethers.BigNumber.from(350_000).add(
        await provider.estimateGas({
          to: ethers.constants.AddressZero,
          data: action.code,
        })
      )
    )

  const resolvedDeploymentPromises = await Promise.all(
    deployedProxyPromises.concat(deployedImplementationPromises)
  )

  estimatedGas = estimatedGas.add(
    resolvedDeploymentPromises.reduce((a, b) => a.add(b))
  )

  return estimatedGas
}

export const estimateExecutionCost = async (
  provider: ethers.providers.JsonRpcProvider,
  bundle: ChugSplashActionBundle,
  actionsExecuted: number,
  projectName: string
): Promise<ethers.BigNumber> => {
  const estExecutionGas = await estimateExecutionGas(
    provider,
    bundle,
    actionsExecuted,
    projectName
  )
  const gasPrice = await provider.getGasPrice()
  return estExecutionGas.mul(gasPrice)
}

export const hasSufficientFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  bundle: ChugSplashActionBundle,
  actionsExecuted: number,
  projectName: string
): Promise<boolean> => {
  const availableFunds = await availableFundsForExecution(provider, projectName)

  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundle,
    actionsExecuted,
    projectName
  )

  return availableFunds.gte(currExecutionCost)
}

export const getAmountToDeposit = async (
  provider: ethers.providers.JsonRpcProvider,
  bundle: ChugSplashActionBundle,
  actionsExecuted: number,
  projectName: string,
  includeBuffer: boolean
): Promise<ethers.BigNumber> => {
  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundle,
    actionsExecuted,
    projectName
  )

  const availableFunds = await availableFundsForExecution(provider, projectName)

  const amountToDeposit = includeBuffer
    ? currExecutionCost.sub(availableFunds).mul(EXECUTION_BUFFER_MULTIPLIER)
    : currExecutionCost.sub(availableFunds)

  return amountToDeposit.lt(0) ? ethers.BigNumber.from(0) : amountToDeposit
}
