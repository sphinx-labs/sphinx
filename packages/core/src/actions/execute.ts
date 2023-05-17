import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import {
  BundledChugSplashAction,
  ChugSplashBundles,
  DeploymentState,
  DeploymentStatus,
} from './types'
import { getGasPriceOverrides } from '../utils'
import {
  fromRawChugSplashAction,
  isDeployContractAction,
  isSetStorageAction,
} from './bundle'

export const executeTask = async (args: {
  chugSplashManager: ethers.Contract
  bundles: ChugSplashBundles
  deploymentState: DeploymentState
  executor: ethers.Signer
  provider: ethers.providers.Provider
  projectName: string
  logger?: Logger | undefined
}): Promise<boolean> => {
  const { bundles, deploymentState, executor, provider, projectName, logger } =
    args

  const chugSplashManager = args.chugSplashManager.connect(executor)

  const { actionBundle, targetBundle } = bundles

  logger?.info(`[ChugSplash]: preparing to execute the project...`)

  if (deploymentState.status === DeploymentStatus.COMPLETED) {
    logger?.info(`[ChugSplash]: already executed: ${projectName}`)
    return true
  }
  // We execute all actions in batches to reduce the total number of transactions and reduce the
  // cost of a deployment in general. Approaching the maximum block gas limit can cause
  // transactions to be executed slowly as a result of the algorithms that miners use to select
  // which transactions to include. As a result, we restrict our total gas usage to a fraction of
  // the block gas limit.
  const latestBlock = await provider.getBlock('latest')
  const gasFraction = 2
  const maxGasLimit = latestBlock.gasLimit.div(gasFraction)

  /**
   * Helper function for finding the maximum number of batch elements that can be executed from a
   * given input list of actions. This is done by performing a binary search over the possible
   * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
   *
   * @param actions List of actions to execute.
   * @returns Maximum number of actions that can be executed.
   */
  const findMaxBatchSize = async (
    actions: BundledChugSplashAction[]
  ): Promise<number> => {
    /**
     * Helper function that determines if a given batch is executable.
     *
     * @param selected Selected actions to execute.
     * @returns True if the batch is executable, false otherwise.
     */
    const executable = async (
      selected: BundledChugSplashAction[]
    ): Promise<boolean> => {
      try {
        await chugSplashManager.callStatic.executeActions(
          selected.map((action) => action.action),
          selected.map((action) => action.proof.actionIndex),
          selected.map((action) => action.proof.siblings),
          {
            gasLimit: maxGasLimit,
          }
        )

        // We didn't error so this batch size is valid.
        return true
      } catch (err) {
        return false
      }
    }

    // Optimization, try to execute the entire batch at once before going through the hassle of a
    // binary search. Can often save a significant amount of time on execution.
    if (await executable(actions)) {
      return actions.length
    }

    // If the full batch size isn't executable, then we need to perform a binary search to find the
    // largest batch size that is actually executable.
    let min = 0
    let max = actions.length
    while (min < max) {
      const mid = Math.ceil((min + max) / 2)
      if (await executable(actions.slice(0, mid))) {
        min = mid
      } else {
        max = mid - 1
      }
    }

    // No possible size works, this is a problem and should never happen.
    if (min === 0) {
      throw new Error(
        'unable to find a batch size that does not exceed the block gas limit'
      )
    }

    return min
  }

  /**
   * Helper function for executing a list of actions in batches.
   *
   * @param actions List of actions to execute.
   */
  const executeBatchActions = async (
    actions: BundledChugSplashAction[]
  ): Promise<DeploymentStatus> => {
    // Pull the deployment state from the contract so we're guaranteed to be up to date.
    const activeDeploymentId = await chugSplashManager.activeDeploymentId()
    let state: DeploymentState = await chugSplashManager.deployments(
      activeDeploymentId
    )

    // Filter out any actions that have already been executed, sort by ascending action index.
    const filtered = actions
      .filter((action) => {
        return !state.actions[action.proof.actionIndex]
      })
      .sort((a, b) => {
        return a.proof.actionIndex - b.proof.actionIndex
      })

    // We can return early if there are no actions to execute.
    if (filtered.length === 0) {
      logger?.info('[ChugSplash]: no actions left to execute')
      return state.status
    }

    let executed = 0
    while (executed < filtered.length) {
      // Figure out the maximum number of actions that can be executed in a single batch.
      const batchSize = await findMaxBatchSize(filtered.slice(executed))

      // Pull out the next batch of actions.
      const batch = filtered.slice(executed, executed + batchSize)

      // Keep 'em notified.
      logger?.info(
        `[ChugSplash]: executing actions ${executed} to ${
          executed + batchSize
        } of ${filtered.length}...`
      )

      // Execute the batch.
      await (
        await chugSplashManager.executeActions(
          batch.map((action) => action.action),
          batch.map((action) => action.proof.actionIndex),
          batch.map((action) => action.proof.siblings),
          await getGasPriceOverrides(provider)
        )
      ).wait()

      state = await chugSplashManager.deployments(activeDeploymentId)
      if (state.status === DeploymentStatus.FAILED) {
        return state.status
      }

      // Move on to the next batch if necessary.
      executed += batchSize
    }

    return state.status
  }

  const deployContractActions = actionBundle.actions.filter((action) =>
    isDeployContractAction(fromRawChugSplashAction(action.action))
  )
  const setStorageActions = actionBundle.actions.filter((action) =>
    isSetStorageAction(fromRawChugSplashAction(action.action))
  )

  logger?.info(`[ChugSplash]: executing 'DEPLOY_CONTRACT' actions...`)
  const status = await executeBatchActions(deployContractActions)
  if (status === DeploymentStatus.FAILED) {
    logger?.error(`[ChugSplash]: failed to execute 'DEPLOY_CONTRACT' actions`)
    return false
  } else if (status === DeploymentStatus.COMPLETED) {
    logger?.info(`[ChugSplash]: finished non-proxied deployment early`)
    return true
  } else {
    logger?.info(`[ChugSplash]: executed 'DEPLOY_CONTRACT' actions`)
  }

  logger?.info(`[ChugSplash]: initiating upgrade...`)
  await (
    await chugSplashManager.initiateUpgrade(
      targetBundle.targets.map((target) => target.target),
      targetBundle.targets.map((target) => target.siblings),
      await getGasPriceOverrides(provider)
    )
  ).wait()
  logger?.info(`[ChugSplash]: initiated upgrde`)

  logger?.info(`[ChugSplash]: executing 'SET_STORAGE' actions...`)
  await executeBatchActions(setStorageActions)
  logger?.info(`[ChugSplash]: executed 'SET_STORAGE' actions`)

  logger?.info(`[ChugSplash]: finalizing upgrade...`)
  await (
    await chugSplashManager.finalizeUpgrade(
      targetBundle.targets.map((target) => target.target),
      targetBundle.targets.map((target) => target.siblings),
      await getGasPriceOverrides(provider)
    )
  ).wait()

  // We're done!
  logger?.info(`[ChugSplash]: successfully executed: ${projectName}`)
  return true
}
