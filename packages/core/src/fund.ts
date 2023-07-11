import { OWNER_BOND_AMOUNT } from '@chugsplash/contracts'
import { ethers } from 'ethers'

import { getChugSplashManagerReadOnly, isContractDeployed } from './utils'
import {
  ChugSplashBundles,
  DeployContractAction,
  fromRawChugSplashAction,
  isDeployContractAction,
  isSetStorageAction,
} from './actions'
import { EXECUTION_BUFFER_MULTIPLIER } from './constants'
import { ParsedProjectConfig, contractKindHashes } from './config/types'

/**
 * Gets the amount ETH in the ChugSplashManager that can be used to execute a deployment. This
 * equals the ChugSplashManager's balance minus the total debt owed to executors minus the owner's
 * bond amount.
 */
export const availableFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  deployer: string
): Promise<ethers.BigNumber> => {
  const managerReadOnly = getChugSplashManagerReadOnly(deployer, provider)

  const managerBalance = await provider.getBalance(managerReadOnly.address)
  const totalDebt = await managerReadOnly.totalDebt()
  return managerBalance.sub(totalDebt).sub(OWNER_BOND_AMOUNT)
}

export const getOwnerWithdrawableAmount = async (
  provider: ethers.providers.JsonRpcProvider,
  deployer: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManagerReadOnly(deployer, provider)

  if (
    (await ChugSplashManager.activeDeploymentId()) !== ethers.constants.HashZero
  ) {
    return ethers.BigNumber.from(0)
  }

  const managerBalance = await provider.getBalance(ChugSplashManager.address)
  const totalDebt = await ChugSplashManager.totalDebt()
  return managerBalance.sub(totalDebt)
}

export const estimateExecutionGas = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number
): Promise<ethers.BigNumber> => {
  const actions = bundles.actionBundle.actions
    .map((action) => fromRawChugSplashAction(action.action))
    .slice(actionsExecuted)

  const estimatedGas = ethers.BigNumber.from(150_000).mul(
    actions.filter((action) => isSetStorageAction(action)).length
  )

  const deployedContractPromises = actions
    .filter((action) => isDeployContractAction(action))
    .map(async (action: DeployContractAction) => {
      if (await isContractDeployed(action.addr, provider)) {
        return ethers.BigNumber.from(0)
      } else if (action.contractKindHash === contractKindHashes['proxy']) {
        // If the contract is a default proxy, then estimate 550k gas. This is a minor optimization
        // that we can make because we know the cost of deploying the proxy ahead of time.
        return ethers.BigNumber.from(550_000)
      } else {
        return provider.estimateGas({
          data: action.code,
        })
      }
    })

  const resolved = await Promise.all(deployedContractPromises)

  const estimatedContractDeploymentGas = resolved.reduce(
    (a, b) => a.add(b),
    ethers.BigNumber.from(0)
  )

  // We also tack on an extra 200k gas for each proxy target (including any that are not being upgraded) to account
  // for the variable cost of the `initiateBundleExecution` and `completeBundleExecution` functions.
  const initiateAndCompleteCost = ethers.BigNumber.from(200_000).mul(
    bundles.targetBundle.targets.length
  )

  return estimatedGas
    .add(estimatedContractDeploymentGas)
    .add(initiateAndCompleteCost)
}

export const estimateExecutionCost = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number
): Promise<ethers.BigNumber> => {
  const estExecutionGas = await estimateExecutionGas(
    provider,
    bundles,
    actionsExecuted
  )
  const feeData = await provider.getFeeData()

  // Use the `maxFeePerGas` if it exists, otherwise use the `gasPrice`. The `maxFeePerGas` is not
  // defined on Optimism.
  const estGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice

  if (estGasPrice === null) {
    throw new Error(`Gas price does not exist on network`)
  }

  return estExecutionGas.mul(estGasPrice)
}

export const hasSufficientFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number,
  parsedProjectConfig: ParsedProjectConfig
): Promise<boolean> => {
  const availableFunds = await availableFundsForExecution(
    provider,
    parsedProjectConfig.options.deployer
  )

  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundles,
    actionsExecuted
  )

  return availableFunds.gte(currExecutionCost)
}

export const getAmountToDeposit = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number,
  parsedConfig: ParsedProjectConfig,
  includeBuffer: boolean
): Promise<ethers.BigNumber> => {
  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundles,
    actionsExecuted
  )

  const availableFunds = await availableFundsForExecution(
    provider,
    parsedConfig.options.deployer
  )

  const amountToDeposit = includeBuffer
    ? currExecutionCost.mul(EXECUTION_BUFFER_MULTIPLIER).sub(availableFunds)
    : currExecutionCost.sub(availableFunds)

  return amountToDeposit.lt(0) ? ethers.BigNumber.from(0) : amountToDeposit
}
