import { ChugSplashManagerABI } from '@chugsplash/contracts'
import { ethers } from 'ethers'

import { getChugSplashManagerProxyAddress } from './utils'
import { ParsedChugSplashConfig } from './config/types'

/**
 * Gets the amount ETH in the ChugSplashManager that can be used to execute a deployment.
 * This equals the ChugSplashManager's balance minus the total debt owed to executors.
 */
export const getOwnerBalanceInChugSplashManager = async (
  provider: ethers.providers.JsonRpcProvider,
  projectName: string
): Promise<ethers.BigNumber> => {
  const ChugSplashManager = new ethers.Contract(
    getChugSplashManagerProxyAddress(projectName),
    ChugSplashManagerABI,
    provider
  )

  const managerBalance = await provider.getBalance(ChugSplashManager.address)
  const totalDebt = await ChugSplashManager.totalDebt()
  return managerBalance.sub(totalDebt)
}

/**
 * Gets the minimum amount that must be sent to the ChugSplashManager in order to execute the
 * ChugSplash config. If this function returns zero, then there is already a sufficient amount of
 * funds.
 *
 * @param provider JSON RPC provider.
 * @param parsedConfig Parsed ChugSplash config.
 * @returns The minimum amount to send to the ChugSplashManager in order to execute the config
 * (denominated in wei).
 */
export const getExecutionAmountToSend = async (
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig
): Promise<ethers.BigNumber> => {
  const totalExecutionAmount = await simulateExecution(provider, parsedConfig)
  const availableExecutionAmount = await getOwnerBalanceInChugSplashManager(
    provider,
    parsedConfig.options.projectName
  )
  const executionAmount = totalExecutionAmount.sub(availableExecutionAmount)
  return executionAmount.gt(0) ? executionAmount : ethers.BigNumber.from(0)
}

export const simulateExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig
) => {
  provider
  parsedConfig

  // TODO
  return ethers.utils.parseEther('0.25')
}

/**
 * Returns the amount to send to the ChugSplashManager to execute a bundle, plus a buffer in case
 * the gas price increases during execution. If this returns zero, there is already a sufficient
 * amount of funds in the ChugSplashManager.
 *
 * @param provider JSON RPC provider.
 * @param parsedConfig Parsed ChugSplash config.
 * @returns The amount required to fund a bundle, plus a buffer. Denominated in wei.
 */
export const getExecutionAmountToSendPlusBuffer = async (
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig
) => {
  const executionAmount = await getExecutionAmountToSend(provider, parsedConfig)
  return executionAmount.mul(15).div(10)
}

export const hasSufficientFundsForExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig
): Promise<boolean> => {
  // Get the amount of funds that must be sent to the ChugSplashManager in order to execute the
  // bundle.
  const executionAmount = await getExecutionAmountToSend(provider, parsedConfig)
  return executionAmount.eq(0)
}
