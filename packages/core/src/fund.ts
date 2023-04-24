import { OWNER_BOND_AMOUNT, DefaultProxyArtifact } from '@chugsplash/contracts'
import { BigNumber, ethers, utils } from 'ethers'

import {
  getChugSplashManager,
  getChugSplashManagerAddress,
  isContractDeployed,
  getCreationCodeWithConstructorArgs,
} from './utils'
import {
  ChugSplashBundles,
  DeployContractAction,
  fromRawChugSplashAction,
  isDeployContractAction,
  isSetStorageAction,
} from './actions'
import { EXECUTION_BUFFER_MULTIPLIER } from './constants'

/**
 * Gets the amount ETH in the ChugSplashManager that can be used to execute a deployment. This
 * equals the ChugSplashManager's balance minus the total debt owed to executors minus the owner's
 * bond amount.
 */
export const availableFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  claimer: string,
  organizationID: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManager(
    provider,
    claimer,
    organizationID
  )

  const managerBalance = await provider.getBalance(ChugSplashManager.address)
  const totalDebt = await ChugSplashManager.totalDebt()
  return managerBalance.sub(totalDebt).sub(OWNER_BOND_AMOUNT)
}

export const getOwnerWithdrawableAmount = async (
  provider: ethers.providers.JsonRpcProvider,
  claimer: string,
  organizationID: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = getChugSplashManager(
    provider,
    claimer,
    organizationID
  )

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
  bundles: ChugSplashBundles,
  actionsExecuted: number,
  claimer: string,
  organizationID: string
): Promise<ethers.BigNumber> => {
  const actions = bundles.actionBundle.actions
    .map((action) => fromRawChugSplashAction(action.action))
    .slice(actionsExecuted)

  let estimatedGas = ethers.BigNumber.from(45_000).mul(
    actions.filter((action) => isSetStorageAction(action)).length
  )

  const managerAddress = await getChugSplashManagerAddress(
    claimer,
    organizationID
  )

  const deployedProxyPromises = actions
    .filter((action) => isDeployContractAction(action))
    .map(async (action) => {
      const defaultProxyCode = await getCreationCodeWithConstructorArgs(
        DefaultProxyArtifact.bytecode,
        {
          _admin: managerAddress,
        },
        DefaultProxyArtifact.abi
      )

      // If the proxy has already been deployed, then estimate 0 gas. Otherwise, estimate 550k for the default proxy.
      return (await isContractDeployed(action.proxy, provider))
        ? ethers.BigNumber.from(0)
        : provider.estimateGas({
            data: defaultProxyCode,
          })
    })

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

  estimatedGas = estimatedGas.add(estimatedContractDeploymentGas)

  return estimatedGas.add(BigNumber.from(400_000))
}

export const estimateExecutionCost = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number,
  claimer: string,
  organizationID: string
): Promise<ethers.BigNumber> => {
  const estExecutionGas = await estimateExecutionGas(
    provider,
    bundles,
    actionsExecuted,
    claimer,
    organizationID
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
  claimer: string,
  organizationID: string
): Promise<boolean> => {
  const availableFunds = await availableFundsForExecution(
    provider,
    claimer,
    organizationID
  )

  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundles,
    actionsExecuted,
    claimer,
    organizationID
  )

  return availableFunds.gte(currExecutionCost)
}

export const getAmountToDeposit = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: ChugSplashBundles,
  actionsExecuted: number,
  claimer: string,
  organizationID: string,
  includeBuffer: boolean
): Promise<ethers.BigNumber> => {
  const currExecutionCost = await estimateExecutionCost(
    provider,
    bundles,
    actionsExecuted,
    claimer,
    organizationID
  )

  const availableFunds = await availableFundsForExecution(
    provider,
    claimer,
    organizationID
  )

  const amountToDeposit = includeBuffer
    ? currExecutionCost.mul(EXECUTION_BUFFER_MULTIPLIER).sub(availableFunds)
    : currExecutionCost.sub(availableFunds)

  return amountToDeposit.lt(0) ? ethers.BigNumber.from(0) : amountToDeposit
}
