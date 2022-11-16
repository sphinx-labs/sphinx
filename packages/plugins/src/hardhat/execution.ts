import {
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  ChugSplashConfig,
  chugsplashLog,
  getChugSplashRegistry,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { SingleBar, Presets } from 'cli-progress'
import { ethers } from 'ethers'
import { ChugSplashManagerABI } from '@chugsplash/contracts'
import { sleep } from '@eth-optimism/core-utils'

import { getExecutionAmountInChugSplashManager } from './fund'

export const monitorRemoteExecution = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig,
  bundleId: string,
  silent: boolean
): Promise<string> => {
  const progressBar = new SingleBar({}, Presets.shades_classic)

  const provider = hre.ethers.provider

  const projectName = parsedConfig.options.projectName
  const ChugSplashRegistry = getChugSplashRegistry(provider.getSigner())
  const ChugSplashManager = new ethers.Contract(
    await ChugSplashRegistry.projects(projectName),
    ChugSplashManagerABI,
    provider
  )

  // Get the bundle state of the bundle ID.
  let bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  // Handle cases where the bundle is completed, cancelled, or not yet approved.
  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    chugsplashLog(`${projectName} has already been completed.`, silent)
    return
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    // Set the progress bar to be the number of executions that had occurred when the bundle was
    // cancelled.
    progressBar.start(
      bundleState.executions.length,
      bundleState.actionsExecuted
    )
    throw new Error(`${projectName} was cancelled.`)
  } else if (bundleState.status !== ChugSplashBundleStatus.APPROVED) {
    throw new Error(`${projectName} has not been approved for execution yet.`)
  }

  // If we make it to this point, we know that the given bundle is active.

  // Set the status bar to display the number of actions executed so far.
  progressBar.start(
    bundleState.executions.length,
    bundleState.actionsExecuted.toNumber()
  )

  while (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    // Check if the available execution amount in the ChugSplashManager is too low to finish the
    // deployment. We do this by estimating the cost of a large transaction, which is calculated by
    // taking the current gas price and multiplying it by eight million. For reference, it costs
    // ~5.5 million gas to deploy Seaport. This estimated cost is compared to the available
    // execution amount in the ChugSplashManager.
    const gasPrice = await provider.getGasPrice()
    const availableExecutionAmount =
      await getExecutionAmountInChugSplashManager(provider, projectName)
    if (gasPrice.mul(8_000_000).gt(availableExecutionAmount)) {
      // If the available execution amount is less than the estimated value, throw an error.
      const estCost = gasPrice.mul(ethers.utils.parseEther('0.1'))
      throw new Error(
        `${projectName} ran out of funds. Please report this error. Run the following command to add funds to your deployment so it can be completed:

  npx hardhat fund --network ${hre.network.name} --amount ${estCost} <configPath>
        `
      )
    }

    // Get the current bundle state.
    bundleState = await ChugSplashManager.bundles(bundleId)

    // Update the progress bar.
    progressBar.update(bundleState.actionsExecuted.toNumber())

    // Wait for one second.
    await sleep(1000)
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    progressBar.update(bundleState.executions.length)
    chugsplashLog('\n', silent)

    // Get the `completeChugSplashBundle` transaction.
    const [finalDeploymentEvent] = await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashBundleCompleted(bundleId)
    )
    const finalDeploymentTxnHash = finalDeploymentEvent.transactionHash
    return finalDeploymentTxnHash
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(`${projectName} was cancelled.`)
  }
}
