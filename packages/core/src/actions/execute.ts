import { ethers, providers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import {
  BundledSphinxAction,
  SphinxActionType,
  SphinxBundles,
  DeploymentState,
  DeploymentStatus,
} from './types'
import { getGasPriceOverrides } from '../utils'
import {
  getDeployContractActionBundle,
  getSetStorageActionBundle,
} from './bundle'
import { ProjectConfigArtifacts } from '../config/types'
import { getEstDeployContractCost } from '../estimate'

export const executeDeployment = async (
  manager: ethers.Contract,
  bundles: SphinxBundles,
  blockGasLimit: ethers.BigNumber,
  projectConfigArtifacts: ProjectConfigArtifacts,
  provider: ethers.providers.Provider,
  logger?: Logger | undefined
): Promise<boolean> => {
  const { actionBundle, targetBundle } = bundles

  logger?.info(`[Sphinx]: preparing to execute the project...`)

  // We execute all actions in batches to reduce the total number of transactions and reduce the
  // cost of a deployment in general. Approaching the maximum block gas limit can cause
  // transactions to be executed slowly as a result of the algorithms that miners use to select
  // which transactions to include. As a result, we restrict our total gas usage to a fraction of
  // the block gas limit.
  const gasFraction = 2
  const maxGasLimit = blockGasLimit.div(gasFraction)

  const deployContractActionBundle = getDeployContractActionBundle(actionBundle)
  const setStorageActionBundle = getSetStorageActionBundle(actionBundle)

  logger?.info(`[Sphinx]: executing 'DEPLOY_CONTRACT' actions...`)
  const status = await executeBatchActions(
    deployContractActionBundle,
    manager,
    maxGasLimit,
    projectConfigArtifacts,
    provider,
    logger
  )
  if (status === DeploymentStatus.FAILED) {
    logger?.error(`[Sphinx]: failed to execute 'DEPLOY_CONTRACT' actions`)
    return false
  } else if (status === DeploymentStatus.COMPLETED) {
    logger?.info(`[Sphinx]: finished non-proxied deployment early`)
    return true
  } else {
    logger?.info(`[Sphinx]: executed 'DEPLOY_CONTRACT' actions`)
  }

  logger?.info(`[Sphinx]: initiating upgrade...`)
  await (
    await manager.initiateUpgrade(
      targetBundle.targets.map((target) => target.target),
      targetBundle.targets.map((target) => target.siblings),
      await getGasPriceOverrides(provider)
    )
  ).wait()
  logger?.info(`[Sphinx]: initiated upgrde`)

  logger?.info(`[Sphinx]: executing 'SET_STORAGE' actions...`)
  await executeBatchActions(
    setStorageActionBundle,
    manager,
    maxGasLimit,
    projectConfigArtifacts,
    provider,
    logger
  )
  logger?.info(`[Sphinx]: executed 'SET_STORAGE' actions`)

  logger?.info(`[Sphinx]: finalizing upgrade...`)
  await (
    await manager.finalizeUpgrade(
      targetBundle.targets.map((target) => target.target),
      targetBundle.targets.map((target) => target.siblings),
      await getGasPriceOverrides(provider)
    )
  ).wait()

  // We're done!
  logger?.info(`[Sphinx]: successfully deployed project`)
  return true
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
  maxGasLimit: ethers.BigNumber,
  projectConfigArtifacts: ProjectConfigArtifacts
): Promise<number> => {
  // Optimization, try to execute the entire batch at once before going through the hassle of a
  // binary search. Can often save a significant amount of time on execution.
  if (await executable(actions, maxGasLimit, projectConfigArtifacts)) {
    return actions.length
  }

  // If the full batch size isn't executable, then we need to perform a binary search to find the
  // largest batch size that is actually executable.
  let min = 0
  let max = actions.length
  while (min < max) {
    const mid = Math.ceil((min + max) / 2)
    if (
      await executable(
        actions.slice(0, mid),
        maxGasLimit,
        projectConfigArtifacts
      )
    ) {
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
  actions: BundledSphinxAction[],
  manager: ethers.Contract,
  maxGasLimit: ethers.BigNumber,
  projectConfigArtifacts: ProjectConfigArtifacts,
  provider: providers.Provider,
  logger?: Logger | undefined
): Promise<DeploymentStatus> => {
  // Pull the deployment state from the contract so we're guaranteed to be up to date.
  const activeDeploymentId = await manager.activeDeploymentId()
  let state: DeploymentState = await manager.deployments(activeDeploymentId)

  // Filter out any actions that have already been executed.
  const filtered = actions.filter((action) => {
    return !state.actions[action.proof.actionIndex]
  })

  // We can return early if there are no actions to execute.
  if (filtered.length === 0) {
    logger?.info('[Sphinx]: no actions left to execute')
    return state.status
  }

  let executed = 0
  while (executed < filtered.length) {
    // Figure out the maximum number of actions that can be executed in a single batch.
    const batchSize = await findMaxBatchSize(
      filtered.slice(executed),
      maxGasLimit,
      projectConfigArtifacts
    )

    // Pull out the next batch of actions.
    const batch = filtered.slice(executed, executed + batchSize)

    // Keep 'em notified.
    logger?.info(
      `[Sphinx]: executing actions ${executed} to ${executed + batchSize} of ${
        filtered.length
      }...`
    )

    // Execute the batch.
    await (
      await manager.executeActions(
        batch.map((action) => action.action),
        batch.map((action) => action.proof.actionIndex),
        batch.map((action) => action.proof.siblings),
        await getGasPriceOverrides(provider)
      )
    ).wait()

    state = await manager.deployments(activeDeploymentId)
    if (state.status === DeploymentStatus.FAILED) {
      return state.status
    }

    // Move on to the next batch if necessary.
    executed += batchSize
  }

  return state.status
}

/**
 * Helper function that determines if a given batch is executable.
 *
 * @param selected Selected actions to execute.
 * @returns True if the batch is executable, false otherwise.
 */
export const executable = async (
  selected: BundledSphinxAction[],
  maxGasLimit: ethers.BigNumber,
  projectConfigArtifacts: ProjectConfigArtifacts
): Promise<boolean> => {
  let estGasUsed: ethers.BigNumber = ethers.BigNumber.from(0)

  for (const action of selected) {
    const { actionType, referenceName } = action.action
    if (actionType === SphinxActionType.DEPLOY_CONTRACT) {
      const { buildInfo, artifact } = projectConfigArtifacts[referenceName]
      const { sourceName, contractName } = artifact

      const deployContractCost = getEstDeployContractCost(
        buildInfo.output.contracts[sourceName][contractName].evm.gasEstimates
      )

      // We add 150k as an estimate for the cost of the transaction that executes the DeployContract
      // action.
      estGasUsed = estGasUsed.add(deployContractCost).add(150_000)
    } else if (actionType === SphinxActionType.SET_STORAGE) {
      estGasUsed = estGasUsed.add(ethers.BigNumber.from(150_000))
    } else {
      throw new Error(`Unknown action type. Should never happen.`)
    }
  }

  return maxGasLimit.gt(estGasUsed)
}
