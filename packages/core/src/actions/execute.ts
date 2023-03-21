import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import { fromRawChugSplashAction, isDeployImplementationAction } from './bundle'
import {
  BundledChugSplashAction,
  ChugSplashBundles,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
} from './types'
import { getGasPriceOverrides } from '../utils'

export const executeTask = async (args: {
  chugSplashManager: ethers.Contract
  bundles: ChugSplashBundles
  bundleState: ChugSplashBundleState
  executor: ethers.Wallet
  organizationID: string
  logger: Logger
}) => {
  const {
    chugSplashManager,
    bundles,
    bundleState,
    executor,
    organizationID,
    logger,
  } = args

  const { actionBundle, targetBundle } = bundles

  logger.info(`[ChugSplash]: preparing to execute the project...`)

  if (
    bundleState.status !== ChugSplashBundleStatus.APPROVED &&
    bundleState.status !== ChugSplashBundleStatus.COMPLETED
  ) {
    throw new Error(
      `${organizationID} cannot be executed. current project status: ${bundleState.status}`
    )
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    logger.info(`[ChugSplash]: already executed: ${organizationID}`)
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    // We execute all actions in batches to reduce the total number of transactions and reduce the
    // cost of a deployment in general. Approaching the maximum block gas limit can cause
    // transactions to be executed slowly as a result of the algorithms that miners use to select
    // which transactions to include. As a result, we restrict our total gas usage to a fraction of
    // the block gas limit.
    const latestBlock = await executor.provider.getBlock('latest')
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
    const executeBatchActions = async (actions: BundledChugSplashAction[]) => {
      // Pull the bundle state from the contract so we're guaranteed to be up to date.
      const activeBundleId = await chugSplashManager.activeBundleId()
      const state: ChugSplashBundleState = await chugSplashManager.bundles(
        activeBundleId
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
        logger.info('[ChugSplash]: no actions left to execute')
        return
      }

      let executed = 0
      while (executed < filtered.length) {
        // Figure out the maximum number of actions that can be executed in a single batch.
        const batchSize = await findMaxBatchSize(filtered.slice(executed))

        // Pull out the next batch of actions.
        const batch = filtered.slice(executed, executed + batchSize)

        // Keep 'em notified.
        logger.info(
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
            await getGasPriceOverrides(executor.provider)
          )
        ).wait()

        // Move on to the next batch if necessary.
        executed += batchSize
      }
    }

    // Find the indices of the first DeployImplementation and SetImpl actions so we know where to
    // split up our batches. Actions have already been sorted in the order: SetStorage then
    // DeployImplementation.
    const firstDepImpl = actionBundle.actions.findIndex((action) =>
      isDeployImplementationAction(fromRawChugSplashAction(action.action))
    )

    logger.info(`[ChugSplash]: initiating execution...`)
    await (
      await chugSplashManager.initiateBundleExecution(
        targetBundle.targets.map((target) => target.target),
        targetBundle.targets.map((target) => target.siblings),
        await getGasPriceOverrides(executor.provider)
      )
    ).wait()

    logger.info(`[ChugSplash]: execution initiated`)

    // Execute SetStorage actions in batches.
    logger.info(`[ChugSplash]: executing SetStorage actions...`)
    await executeBatchActions(actionBundle.actions.slice(0, firstDepImpl))
    logger.info(`[ChugSplash]: executed SetStorage actions`)

    // Execute DeployImplementation actions in batches.
    logger.info(`[ChugSplash]: executing DeployImplementation actions...`)
    await executeBatchActions(actionBundle.actions.slice(firstDepImpl))
    logger.info(`[ChugSplash]: executed DeployImplementation actions`)

    logger.info(`[ChugSplash]: completing execution...`)
    await (
      await chugSplashManager.completeBundleExecution(
        targetBundle.targets.map((target) => target.target),
        targetBundle.targets.map((target) => target.siblings),
        await getGasPriceOverrides(executor.provider)
      )
    ).wait()

    // We're done!
    logger.info(`[ChugSplash]: successfully executed: ${organizationID}`)
  }
}
