import { OWNER_BOND_AMOUNT } from '@chugsplash/contracts'
import { ethers, utils } from 'ethers'

import {
  getChugSplashManager,
  getChugSplashManagerAddress,
  isContractDeployed,
} from './utils'
import {
  ChugSplashBundles,
  DeployContractAction,
  fromRawChugSplashAction,
  isDeployContractAction,
  isSetStorageAction,
} from './actions'
import { EXECUTION_BUFFER_MULTIPLIER } from './constants'
import { ParsedChugSplashConfig } from './config'

/**
 * Gets the amount ETH in the ChugSplashManager that can be used to execute a deployment. This
 * equals the ChugSplashManager's balance minus the total debt owed to executors minus the owner's
 * bond amount.
 */
export const availableFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  organizationID: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManager(provider, organizationID)

  const managerBalance = await provider.getBalance(ChugSplashManager.address)
  const totalDebt = await ChugSplashManager.totalDebt()
  return managerBalance.sub(totalDebt).sub(OWNER_BOND_AMOUNT)
}

export const getOwnerWithdrawableAmount = async (
  provider: ethers.providers.JsonRpcProvider,
  organizationID: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManager(provider, organizationID)

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
  actionsExecuted: number,
  parsedConfig: ParsedChugSplashConfig
): Promise<ethers.BigNumber> => {
  const actions = bundles.actionBundle.actions
    .map((action) => fromRawChugSplashAction(action.action))
    .slice(actionsExecuted)

  const estimatedGas = ethers.BigNumber.from(150_000).mul(
    actions.filter((action) => isSetStorageAction(action)).length
  )

  const managerAddress = getChugSplashManagerAddress(
    parsedConfig.options.organizationID
  )

  const deployedProxyPromises = Object.values(parsedConfig.contracts).map(
    async (contract) =>
      contract.kind === 'internal-default' &&
      !(await isContractDeployed(contract.address, provider))
        ? ethers.BigNumber.from(550_000)
        : ethers.BigNumber.from(0)
  )

  const deployedContractPromises = actions
    .filter((action) => isDeployContractAction(action))
    .map(async (action: DeployContractAction) => {
      const implementationAddress = utils.getCreate2Address(
        managerAddress,
        ethers.constants.HashZero,
        utils.solidityKeccak256(['bytes'], [action.code])
      )

      // If the implementation has already been deployed, then estimate 0 gas. Otherwise, estimate the gas to deploy the implementation.
      return (await isContractDeployed(implementationAddress, provider))
        ? ethers.BigNumber.from(0)
        : provider.estimateGas({
            data: action.code,
          })
    })

  const resolvedContractDeploymentPromises = await Promise.all(
    deployedProxyPromises.concat(deployedContractPromises)
  )

  const estimatedContractDeploymentGas =
    resolvedContractDeploymentPromises.reduce(
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
  actionsExecuted: number,
  parsedConfig: ParsedChugSplashConfig
): Promise<ethers.BigNumber> => {
  const estExecutionGas = await estimateExecutionGas(
    provider,
    bundles,
    actionsExecuted,
    parsedConfig
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
  parsedConfig: ParsedChugSplashConfig
): Promise<boolean> => {
  const availableFunds = await availableFundsForExecution(
    provider,
    parsedConfig.options.organizationID
  )

  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundles,
    actionsExecuted,
    parsedConfig
  )

  return availableFunds.gte(currExecutionCost)
}

export const getAmountToDeposit = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number,
  parsedConfig: ParsedChugSplashConfig,
  includeBuffer: boolean
): Promise<ethers.BigNumber> => {
  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundles,
    actionsExecuted,
    parsedConfig
  )

  const availableFunds = await availableFundsForExecution(
    provider,
    parsedConfig.options.organizationID
  )

  const amountToDeposit = includeBuffer
    ? currExecutionCost.mul(EXECUTION_BUFFER_MULTIPLIER).sub(availableFunds)
    : currExecutionCost.sub(availableFunds)

  return amountToDeposit.lt(0) ? ethers.BigNumber.from(0) : amountToDeposit
}
