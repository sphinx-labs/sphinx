import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import {
  fromRawChugSplashAction,
  isDeployImplementationAction,
  isSetImplementationAction,
} from './bundle'
import {
  BundledChugSplashAction,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
} from './types'
import { getGasPriceOverrides } from '../utils'

export const executeTask = async (args: {
  chugSplashManager: ethers.Contract
  bundle: ChugSplashActionBundle
  bundleState: ChugSplashBundleState
  executor: ethers.Wallet
  projectName: string
  logger: Logger
}) => {
  const {
    chugSplashManager,
    bundle,
    bundleState,
    executor,
    projectName,
    logger,
  } = args

  logger.info(`[ChugSplash]: preparing to execute the project...`)

  if (
    bundleState.status !== ChugSplashBundleStatus.APPROVED &&
    bundleState.status !== ChugSplashBundleStatus.COMPLETED
  ) {
    throw new Error(
      `${projectName} cannot be executed. current project status: ${bundleState.status}`
    )
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    logger.info(`[ChugSplash]: already executed: ${projectName}`)
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
          await chugSplashManager.callStatic.executeMultipleActions(
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
          return !state.executions[action.proof.actionIndex]
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
          await chugSplashManager.executeMultipleActions(
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
    // split up our batches. Actions have already been sorted in the order SetStorage,
    // DeployImplementation, SetImplementation. Although we could execute SetStorage and
    // DeployImplementation actions together, SetStorage actions can often fit in a single batch
    // so it's more efficient to execute them separately.
    const firstDepImpl = bundle.actions.findIndex((action) =>
      isDeployImplementationAction(fromRawChugSplashAction(action.action))
    )
    const firstSetImpl = bundle.actions.findIndex((action) =>
      isSetImplementationAction(fromRawChugSplashAction(action.action))
    )

    // Execute SetStorage actions in batches.
    logger.info(`[ChugSplash]: executing SetStorage actions...`)
    await executeBatchActions(bundle.actions.slice(0, firstDepImpl))
    logger.info(`[ChugSplash]: executed SetStorage actions`)

    // Execute DeployImplementation actions in batches.
    logger.info(`[ChugSplash]: executing DeployImplementation actions...`)
    await executeBatchActions(bundle.actions.slice(firstDepImpl, firstSetImpl))
    logger.info(`[ChugSplash]: executed DeployImplementation actions`)

    // Execute SetImplementation actions in a single transaction.
    logger.info(`[ChugSplash]: executing SetImplementation actions...`)
    const setImplActions = bundle.actions.slice(firstSetImpl)
    await (
      await chugSplashManager.completeChugSplashBundle(
        setImplActions.map((action) => action.action),
        setImplActions.map((action) => action.proof.actionIndex),
        setImplActions.map((action) => action.proof.siblings),
        await getGasPriceOverrides(executor.provider)
      )
    ).wait()
    logger.info(`[ChugSplash]: executed SetImplementation actions`)

    // We're done!
    logger.info(`[ChugSplash]: successfully executed: ${projectName}`)
  }
}
