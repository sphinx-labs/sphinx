import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import {
  ActionWithProof,
  ChugSplashMerkleTrees,
  ChugSplashDeploymentState,
  DeploymentStatus,
} from './types'
import { getGasPriceOverrides } from '../utils'

export const executeTask = async (args: {
  chugSplashManager: ethers.Contract
  trees: ChugSplashMerkleTrees
  deploymentState: ChugSplashDeploymentState
  executor: ethers.Signer
  provider: ethers.providers.Provider
  projectName: string
  logger?: Logger | undefined
}) => {
  const { trees, deploymentState, executor, provider, projectName, logger } = args

  const chugSplashManager = args.chugSplashManager.connect(executor)

  const { actionTree, targetTree } = trees

  logger?.info(`[ChugSplash]: preparing to execute the project...`)

  if (deploymentState.status === DeploymentStatus.COMPLETED) {
    logger?.info(`[ChugSplash]: already executed: ${projectName}`)
    return
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
    actions: ActionWithProof[]
  ): Promise<number> => {
    /**
     * Helper function that determines if a given batch is executable.
     *
     * @param selected Selected actions to execute.
     * @returns True if the batch is executable, false otherwise.
     */
    const executable = async (
      selected: ActionWithProof[]
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
  const executeBatchActions = async (actions: ActionWithProof[]) => {
    // Pull the deployment state from the contract so we're guaranteed to be up to date.
    const activeDeploymentId = await chugSplashManager.activeDeploymentId()
    const state: ChugSplashDeploymentState = await chugSplashManager.deployments(
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
      return
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

      // Move on to the next batch if necessary.
      executed += batchSize
    }
  }

  logger?.info(`[ChugSplash]: initiating execution...`)
  await (
    await chugSplashManager.initiateExecution(
      targetTree.targets.map((target) => target.target),
      targetTree.targets.map((target) => target.siblings),
      await getGasPriceOverrides(provider)
    )
  ).wait()

  logger?.info(`[ChugSplash]: execution initiated`)

  // Execute actions in batches.
  logger?.info(`[ChugSplash]: executing actions...`)
  await executeBatchActions(actionTree.actions)
  logger?.info(`[ChugSplash]: executed actions`)

  logger?.info(`[ChugSplash]: completing execution...`)
  await (
    await chugSplashManager.completeExecution(
      targetTree.targets.map((target) => target.target),
      targetTree.targets.map((target) => target.siblings),
      await getGasPriceOverrides(provider)
    )
  ).wait()

  // We're done!
  logger?.info(`[ChugSplash]: successfully executed: ${projectName}`)
}
