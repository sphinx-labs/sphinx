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

export const monitorRemoteExecution = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig,
  bundleId: string,
  silent: boolean
): Promise<string> => {
  const progressBar = new SingleBar({}, Presets.shades_classic)

  const projectName = parsedConfig.options.projectName
  const ChugSplashRegistry = getChugSplashRegistry(
    hre.ethers.provider.getSigner()
  )
  const ChugSplashManager = new ethers.Contract(
    await ChugSplashRegistry.projects(projectName),
    ChugSplashManagerABI,
    hre.ethers.provider
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
