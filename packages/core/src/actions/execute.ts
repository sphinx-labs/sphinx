import { EXECUTOR_BOND_AMOUNT } from '@chugsplash/contracts'
import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'

import {
  fromRawChugSplashAction,
  isDeployImplementationAction,
  isSetImplementationAction,
} from './bundle'
import {
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
} from './types'

export const executeTask = async (args: {
  chugSplashManager: ethers.Contract
  bundleId: string
  bundle: ChugSplashActionBundle
  executor: ethers.Signer
  projectName: string
  logger: Logger
}) => {
  const { chugSplashManager, bundleId, bundle, executor, projectName, logger } =
    args

  logger.info(`Preparing to execute the project...`)

  const bundleState: ChugSplashBundleState = await chugSplashManager.bundles(
    bundleId
  )
  const executorAddress = await executor.getAddress()

  if (
    bundleState.status !== ChugSplashBundleStatus.APPROVED &&
    bundleState.status !== ChugSplashBundleStatus.COMPLETED
  ) {
    throw new Error(
      `${projectName} cannot be executed. Current project status: ${bundleState.status}`
    )
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    logger.info(`Already executed: ${projectName}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
      logger.info(`Claiming the bundle for project: ${projectName}`)
      await (
        await chugSplashManager.claimBundle({
          value: EXECUTOR_BOND_AMOUNT,
        })
      ).wait()
      logger.info(`Claimed the bundle.`)
    } else if (bundleState.selectedExecutor !== executorAddress) {
      throw new Error(`Another executor has already claimed the bundle.`)
    }

    logger.info(`Setting the state variables...`)

    // Execute actions that have not been executed yet.
    let currActionsExecuted = bundleState.actionsExecuted.toNumber()

    // The actions have already been sorted in the order: SetStorage,
    // DeployImplementation, SetImplementation. Here, we get the indexes
    // of the first DeployImplementation and SetImplementation action.
    const firstDeployImplIndex = bundle.actions.findIndex((action) =>
      isDeployImplementationAction(fromRawChugSplashAction(action.action))
    )
    const firstSetImplIndex = bundle.actions.findIndex((action) =>
      isSetImplementationAction(fromRawChugSplashAction(action.action))
    )

    // We execute the SetStorage actions in batches, which have a size based on the maximum
    // block gas limit. This speeds up execution considerably. To get the batch size, we divide
    // the block gas limit by 150,000, which is the approximate gas cost of a single SetStorage
    // action. We then divide this quantity by 2 to ensure that we're not approaching the block
    // gas limit. For example, a network with a 30 million block gas limit would result in a
    // batch size of (30 million / 150,000) / 2 = 100 SetStorage actions.
    const { gasLimit: blockGasLimit } = await executor.provider.getBlock(
      'latest'
    )
    const batchSize = blockGasLimit.div(150_000).div(2).toNumber()

    // Execute SetStorage actions in batches.
    const setStorageActions = bundle.actions.slice(0, firstDeployImplIndex)
    for (
      let i = currActionsExecuted;
      i < firstDeployImplIndex;
      i += batchSize
    ) {
      const setStorageBatch = setStorageActions.slice(i, i + batchSize)
      await (
        await chugSplashManager.executeMultipleActions(
          setStorageBatch.map((action) => action.action),
          setStorageBatch.map((action) => action.proof.actionIndex),
          setStorageBatch.map((action) => action.proof.siblings)
        )
      ).wait()
      currActionsExecuted += setStorageBatch.length
    }

    logger.info(
      `State variables have been set. Deploying the implementation contracts...`
    )

    // Execute DeployImplementation actions in series. We execute them one by one since each one
    // costs significantly more gas than a setStorage action (usually in the millions).
    for (let i = currActionsExecuted; i < firstSetImplIndex; i++) {
      const action = bundle.actions[i]
      await (
        await chugSplashManager.executeChugSplashAction(
          action.action,
          action.proof.actionIndex,
          action.proof.siblings
        )
      ).wait()
      currActionsExecuted += 1
      logger.info(
        `Deployed implementation contract: ${
          currActionsExecuted - firstDeployImplIndex
        }/${firstSetImplIndex - firstDeployImplIndex}`
      )
    }

    logger.info('Linking proxies to the implementation contracts...')

    if (currActionsExecuted === firstSetImplIndex) {
      // Complete the bundle by executing all the SetImplementation actions in a single
      // transaction.
      const setImplActions = bundle.actions.slice(firstSetImplIndex)
      await (
        await chugSplashManager.completeChugSplashBundle(
          setImplActions.map((action) => action.action),
          setImplActions.map((action) => action.proof.actionIndex),
          setImplActions.map((action) => action.proof.siblings)
        )
      ).wait()
    }

    logger.info(`Successfully executed: ${projectName}`)
  }
}
