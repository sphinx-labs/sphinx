import { ChugSplashManagerABI } from '@chugsplash/contracts'
import {
  ChugSplashConfig,
  getChugSplashManagerProxyAddress,
} from '@chugsplash/core'
import { Provider } from '@ethersproject/abstract-provider'
import { ethers } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

/**
 * Gets the amount ETH in the ChugSplashManager that can be used to execute a deployment.
 * This equals the ChugSplashManager's balance minus the total debt owed to executors.
 */
export const getOwnerBalanceInChugSplashManager = async (
  provider: Provider,
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

export const getExecutionAmount = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig
): Promise<ethers.BigNumber> => {
  const totalExecutionAmount = await simulateExecution(hre, parsedConfig)
  const availableExecutionAmount = await getOwnerBalanceInChugSplashManager(
    hre.ethers.provider,
    parsedConfig.options.projectName
  )
  const executionAmount = totalExecutionAmount.sub(availableExecutionAmount)
  return executionAmount.gt(0) ? executionAmount : ethers.BigNumber.from(0)
}

export const simulateExecution = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig
) => {
  hre
  parsedConfig

  // TODO
  return ethers.utils.parseEther('0.25')
}

export const getExecutionAmountPlusBuffer = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig
) => {
  const executionAmount = await getExecutionAmount(hre, parsedConfig)
  return executionAmount.mul(15).div(10)
}
