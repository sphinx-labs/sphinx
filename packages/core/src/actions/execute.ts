import { ethers, Provider } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import {
  BundledSphinxAction,
  SphinxActionType,
  SphinxBundles,
  DeploymentState,
  DeploymentStatus,
} from './types'
import { getGasPriceOverrides } from '../utils'
import { getInitialActionBundle, getSetStorageActionBundle } from './bundle'
import { getEstDeployContractCost } from '../estimate'
import { ConfigArtifacts } from '../config'

export const executeDeployment = async (
  manager: ethers.Contract,
  bundles: SphinxBundles,
  blockGasLimit: bigint,
  configArtifacts: ConfigArtifacts,
  provider: ethers.Provider,
  logger?: Logger | undefined
): Promise<{
  success: boolean
  receipts: ethers.TransactionReceipt[]
}> => {
  const { actionBundle, targetBundle } = bundles

  logger?.info(`[Sphinx]: preparing to execute the project...`)

  // We execute all actions in batches to reduce the total number of transactions and reduce the
  // cost of a deployment in general. Approaching the maximum block gas limit can cause
  // transactions to be executed slowly as a result of the algorithms that miners use to select
  // which transactions to include. As a result, we restrict our total gas usage to a fraction of
  // the block gas limit.
  const gasFraction = 2n
  const maxGasLimit = blockGasLimit / gasFraction

  const initialActionBundle = getInitialActionBundle(actionBundle)
  const setStorageActionBundle = getSetStorageActionBundle(actionBundle)

  logger?.info(`[Sphinx]: executing initial actions...`)
  const { status, receipts } = await executeBatchActions(
    initialActionBundle,
    false,
    manager,
    maxGasLimit,
    configArtifacts,
    provider,
    logger
  )
  if (status === DeploymentStatus.FAILED) {
    logger?.error(`[Sphinx]: failed to execute initial actions`)
    return { success: false, receipts }
  } else if (status === DeploymentStatus.COMPLETED) {
    logger?.info(`[Sphinx]: finished non-proxied deployment early`)
    return { success: true, receipts }
  } else {
    logger?.info(`[Sphinx]: executed initial actions`)
  }

  logger?.info(`[Sphinx]: initiating upgrade...`)
  receipts.push(
    await (
      await manager.initiateUpgrade(
        targetBundle.targets.map((target) => target.target),
        targetBundle.targets.map((target) => target.siblings),
        await getGasPriceOverrides(provider)
      )
    ).wait()
  )
  logger?.info(`[Sphinx]: initiated upgrde`)

  logger?.info(`[Sphinx]: executing 'SET_STORAGE' actions...`)
  const { receipts: setStorageReceipts } = await executeBatchActions(
    setStorageActionBundle,
    true,
    manager,
    maxGasLimit,
    configArtifacts,
    provider,
    logger
  )
  receipts.push(...setStorageReceipts)
  logger?.info(`[Sphinx]: executed 'SET_STORAGE' actions`)

  logger?.info(`[Sphinx]: finalizing upgrade...`)
  receipts.push(
    await (
      await manager.finalizeUpgrade(
        targetBundle.targets.map((target) => target.target),
        targetBundle.targets.map((target) => target.siblings),
        await getGasPriceOverrides(provider)
      )
    ).wait()
  )

  // We're done!
  logger?.info(`[Sphinx]: successfully deployed project`)
  return { success: true, receipts }
}

/**
 * Helper function for finding the maximum number of batch elements that can be executed from a
 * given input list of actions. This is done by performing a binary search over the possible
 * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
 *
 * @param actions List of actions to execute.
 * @returns Maximum number of actions that can be executed.
 */
const findMaxBatchSize = async (
  actions: BundledSphinxAction[],
  maxGasLimit: bigint,
  configArtifacts: ConfigArtifacts
): Promise<number> => {
  // Optimization, try to execute the entire batch at once before going through the hassle of a
  // binary search. Can often save a significant amount of time on execution.
  if (await executable(actions, maxGasLimit, configArtifacts)) {
    return actions.length
  }

  // If the full batch size isn't executable, then we need to perform a binary search to find the
  // largest batch size that is actually executable.
  let min = 0
  let max = actions.length
  while (min < max) {
    const mid = Math.ceil((min + max) / 2)
    if (await executable(actions.slice(0, mid), maxGasLimit, configArtifacts)) {
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

// TODO: do this logic in solidity too after testing that the TS logic works

/**
 * Helper function for executing a list of actions in batches.
 *
 * @param actions List of actions to execute.
 */
const executeBatchActions = async (
  actions: BundledSphinxAction[],
  isSetStorageActionArray: boolean,
  manager: ethers.Contract,
  maxGasLimit: bigint,
  configArtifacts: ConfigArtifacts,
  provider: Provider,
  logger?: Logger | undefined
): Promise<{
  status: bigint
  receipts: ethers.TransactionReceipt[]
}> => {
  const receipts: ethers.TransactionReceipt[] = []

  // Pull the deployment state from the contract so we're guaranteed to be up to date.
  const activeDeploymentId = await manager.activeDeploymentId()
  let state: DeploymentState = await manager.deployments(activeDeploymentId)

  // Remove the actions that have already been executed.
  const filtered = actions.filter((action) => {
    return action.action.index >= state.actionsExecuted
  })

  // We can return early if there are no actions to execute.
  if (filtered.length === 0) {
    logger?.info('[Sphinx]: no actions left to execute')
    return { status: state.status, receipts }
  }

  let executed = 0
  while (executed < filtered.length) {
    // Figure out the maximum number of actions that can be executed in a single batch.
    const batchSize = await findMaxBatchSize(
      filtered.slice(executed),
      maxGasLimit,
      configArtifacts
    )

    // Pull out the next batch of actions.
    const batch = filtered.slice(executed, executed + batchSize)

    // Keep 'em notified.
    logger?.info(
      `[Sphinx]: executing actions ${executed} to ${executed + batchSize} of ${
        filtered.length
      }...`
    )

    // Execute the batch of actions.
    if (isSetStorageActionArray) {
      const tx = await (
        await manager.setStorage(
          batch.map((action) => action.action),
          batch.map((action) => action.siblings),
          await getGasPriceOverrides(provider)
        )
      ).wait()
      receipts.push(tx)
    } else {
      const tx = await (
        await manager.executeInitialActions(
          batch.map((action) => action.action),
          batch.map((action) => action.siblings),
          await getGasPriceOverrides(provider)
        )
      ).wait()
      receipts.push(tx)
    }

    // Return early if the deployment failed.
    state = await manager.deployments(activeDeploymentId)
    if (state.status === DeploymentStatus.FAILED) {
      return { status: state.status, receipts }
    }

    // Move on to the next batch if necessary.
    executed += batchSize
  }

  // Return the final deployment status.
  return { status: state.status, receipts }
}

/**
 * Helper function that determines if a given batch is executable.
 *
 * @param selected Selected actions to execute.
 * @returns True if the batch is executable, false otherwise.
 */
export const executable = async (
  selected: BundledSphinxAction[],
  maxGasLimit: bigint,
  configArtifacts: ConfigArtifacts
): Promise<boolean> => {
  let estGasUsed = BigInt(0)

  for (const action of selected) {
    const { actionType, referenceName } = action.action
    if (actionType === SphinxActionType.DEPLOY_CONTRACT) {
      const { buildInfo, artifact } = configArtifacts[referenceName]
      const { sourceName, contractName } = artifact

      const deployContractCost = getEstDeployContractCost(
        buildInfo.output.contracts[sourceName][contractName].evm.gasEstimates
      )

      // We add 150k as an estimate for the cost of the transaction that executes the DeployContract
      // action.
      estGasUsed = estGasUsed + deployContractCost + 150_000n
    } else if (actionType === SphinxActionType.SET_STORAGE) {
      estGasUsed = estGasUsed + BigInt(150_000)
    } else {
      throw new Error(`Unknown action type. Should never happen.`)
    }
  }

  return maxGasLimit > estGasUsed
}
