import * as dotenv from 'dotenv'
dotenv.config()
import { ChugSplashManagerABI } from '@chugsplash/contracts'
import {
  CanonicalChugSplashConfig,
  DeploymentState,
  claimExecutorPayment,
  compileRemoteBundles,
  executeTask,
  ExecutorEvent,
  ExecutorKey,
  getGasPriceOverrides,
  getProjectOwnerAddress,
  hasSufficientFundsForExecution,
  trackExecuted,
  computeDeploymentId,
  ChugSplashBundles,
  isSupportedNetworkOnEtherscan,
  verifyChugSplashConfig,
  getDeployContractActions,
  deploymentDoesRevert,
} from '@chugsplash/core'
import { Logger, LogLevel, LoggerOptions } from '@eth-optimism/common-ts'
import { getChainId } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import { GraphQLClient } from 'graphql-request'

import { updateDeployment } from '../gql'

/**
 *
 * @param event The approval event which will be used to attempt execution
 * @param timesToRetry The total number of times this event should be retried
 * @param waitingPeriodMs The amount of time to wait in between retries if not exponential
 * @returns A new Event object with an updated number of tries and next try time
 */
const generateRetryEvent = (
  event: ExecutorEvent,
  timesToRetry: number = 5,
  waitingPeriodMs?: number
): ExecutorEvent | undefined => {
  let eventWaitingPeriodMs = waitingPeriodMs
  if (!eventWaitingPeriodMs) {
    eventWaitingPeriodMs = 2 * event.waitingPeriodMs
  }

  const now = new Date().getMilliseconds()
  const nextTryMs = now + eventWaitingPeriodMs
  const nextTryDate = new Date(nextTryMs)
  return {
    nextTry: nextTryDate,
    retry: event.retry >= timesToRetry ? -1 : event.retry + 1,
    waitingPeriodMs: eventWaitingPeriodMs,
    event: event.event,
  }
}

const tryVerification = async (
  logger: Logger,
  canonicalConfig: CanonicalChugSplashConfig,
  rpcProvider: ethers.providers.JsonRpcProvider,
  projectName: string,
  network: string,
  graphQLClient: GraphQLClient,
  activeDeploymentId: string,
  attempts: number = 0
) => {
  // verify on etherscan
  try {
    if (isSupportedNetworkOnEtherscan(await getChainId(rpcProvider))) {
      const apiKey = process.env.ETHERSCAN_API_KEY
      if (apiKey) {
        logger.info(
          `[ChugSplash]: attempting to verify source code on etherscan for project: ${projectName}`
        )
        await verifyChugSplashConfig(
          canonicalConfig,
          rpcProvider,
          network,
          apiKey
        )
        logger.info(
          `[ChugSplash]: finished attempting etherscan verification for project: ${projectName}`
        )
      } else {
        logger.info(
          `[ChugSplash]: skipped verifying chugsplash contracts. reason: no api key found`
        )
      }
    } else {
      logger.info(
        `[ChugSplash]: skipped verifying chugsplash contracts. reason: etherscan config not detected for: ${network}`
      )
    }
  } catch (e) {
    logger.error('[ChugSplash]: error: verification error', e)
    if (attempts < 6) {
      // Try again in 30 seconds
      setTimeout(async () => {
        await tryVerification(
          logger,
          canonicalConfig,
          rpcProvider,
          projectName,
          network,
          graphQLClient,
          activeDeploymentId,
          attempts + 1
        )
      }, 10000)
    }
  }

  // Update status in the ChugSplash managed database
  if (graphQLClient) {
    const contracts: {
      referenceName: string
      contractName: string
      address: string
    }[] = []
    Object.entries(canonicalConfig.contracts).forEach(
      ([referenceName, contractConfig]) => {
        contracts.push({
          referenceName,
          contractName: contractConfig.contract,
          address: contractConfig.address,
        })
      }
    )

    try {
      await updateDeployment(
        graphQLClient,
        activeDeploymentId,
        rpcProvider.network.chainId,
        'verified',
        contracts
      )
    } catch (error) {
      logger.error('[ChugSplash]: error: deployment update error', error)
    }
  }
}

export type ExecutorMessage = {
  executorEvent: ExecutorEvent
  key: ExecutorKey
  provider: ethers.providers.JsonRpcProvider | string
  loggerOptions: LoggerOptions
  network: string
  managedApiUrl: string
  managedPublicKey: string | undefined
}

export type ResponseMessage = {
  action: 'discard' | 'retry' | 'success' | 'log'
  payload: ExecutorEvent | undefined
  log: {
    level: LogLevel
    message: string
    err: Error
    options: {
      organizationID: string
      projectName: string
      skipStorageCheck?: boolean
    }
  }
}

export const handleExecution = async (data: ExecutorMessage) => {
  const {
    executorEvent,
    key,
    provider,
    loggerOptions,
    network,
    managedApiUrl,
    managedPublicKey,
  } = data

  const logger = new Logger(loggerOptions)

  let graphQLClient: GraphQLClient | undefined
  // Setup GraphQL Client if the api url and public key are specified
  if (managedApiUrl !== '' && managedPublicKey) {
    graphQLClient = new GraphQLClient(managedApiUrl, {
      headers: {},
    })
  }

  let rpcProvider: ethers.providers.JsonRpcProvider
  if (typeof provider === 'string') {
    rpcProvider = new ethers.providers.JsonRpcProvider(provider)
  } else {
    rpcProvider = provider
  }

  const wallet = new ethers.Wallet(key.privateKey, rpcProvider)

  const managedAddress = executorEvent.event.args[1]
  // fetch manager for relevant project
  const manager = new ethers.Contract(
    managedAddress,
    ChugSplashManagerABI,
    wallet
  )

  // get active deployment ID for this project
  const activeDeploymentId = await manager.activeDeploymentId()

  const deploymentState: DeploymentState = await manager.deployments(
    activeDeploymentId
  )

  if (!deploymentState.remoteExecution) {
    logger.info('[ChugSplash]: skipping local deployment')
    process.send({ action: 'discard', payload: executorEvent })
    return
  } else if (activeDeploymentId === ethers.constants.HashZero) {
    logger.info('[ChugSplash]: no active deployment in project')
    process.send({ action: 'discard', payload: executorEvent })
    return
  }

  // Retrieve the corresponding proposal event to get the config URI.
  const [proposalEvent] = await manager.queryFilter(
    manager.filters.ChugSplashDeploymentProposed(activeDeploymentId)
  )

  logger.info('[ChugSplash]: retrieving the deployment...')
  // Compile the bundle using either the provided localDeploymentId (when running the in-process
  // executor), or using the Config URI
  let bundles: ChugSplashBundles
  let canonicalConfig: CanonicalChugSplashConfig

  // Handle if the config cannot be fetched
  try {
    ;({ bundles, canonicalConfig } = await compileRemoteBundles(
      rpcProvider,
      proposalEvent.args.configUri
    ))
  } catch (e) {
    // retry events which failed due to compilation issues (usually this is if the compiler was not able to be downloaded)
    const retryEvent = generateRetryEvent(executorEvent)
    process.send({ action: 'retry', payload: retryEvent })
  }
  const { projectName, organizationID } = canonicalConfig.options

  const expectedDeploymentId = computeDeploymentId(
    bundles.actionBundle.root,
    bundles.targetBundle.root,
    bundles.actionBundle.actions.length,
    bundles.targetBundle.targets.length,
    getDeployContractActions(bundles.actionBundle).length,
    proposalEvent.args.configUri
  )

  // ensure compiled deployment ID matches proposed deployment ID
  if (expectedDeploymentId !== proposalEvent.args.deploymentId) {
    // We cannot execute the current deployment, so we dicard the event
    // Discarding the event causes the parent process to remove this event from its cache of events currently being executed
    process.send({ action: 'discard', payload: executorEvent })

    // log error and return
    logger.error(
      '[ChugSplash]: error: compiled deployment id does not match proposal event deployment id',
      canonicalConfig.options
    )
    return
  }

  logger.info(`[ChugSplash]: compiled ${projectName} on: ${network}.`)

  if (deploymentState.selectedExecutor === ethers.constants.AddressZero) {
    logger.info(`[ChugSplash]: checking if any of the constructors revert...`)

    if (
      await deploymentDoesRevert(
        rpcProvider,
        manager.address,
        bundles.actionBundle,
        deploymentState.actionsExecuted.toNumber()
      )
    ) {
      process.send({ action: 'discard', payload: executorEvent })
      return
    }

    try {
      await (
        await manager.claimDeployment(await getGasPriceOverrides(rpcProvider))
      ).wait()
    } catch (err) {
      if (
        err.message.includes(
          'ChugSplashManager: deployment is currently claimed by an executor'
        )
      ) {
        logger.info(
          '[ChugSplash]: a different executor claimed the deployment right before this executor'
        )

        // Do not retry the deployment since it will be handled by another executor
        process.send({ action: 'discard', payload: executorEvent })
      } else {
        // A different error occurred. This most likely means the owner cancelled the deployment
        // before it could be claimed. We'll log the error message.
        logger.error(
          '[ChugSplash]: error: claiming deployment error',
          err,
          canonicalConfig.options
        )

        // retry events which failed due to other errors
        const retryEvent = generateRetryEvent(executorEvent)
        process.send({ action: 'retry', payload: retryEvent })
      }

      // Since we can't execute the deployment, return
      return
    }
  } else if (deploymentState.selectedExecutor !== wallet.address) {
    logger.info(
      '[ChugSplash]: a different executor has already claimed the deployment'
    )
    return
  }

  // If we make it to the point, we know that this executor is selected to claim the deployment and
  // that the deployment should execute without an error (i.e. a constructor reverting).

  logger.info(`[ChugSplash]: constructors probably won't revert.`)

  logger.info(`[ChugSplash]: checking that the project is funded...`)

  if (
    await hasSufficientFundsForExecution(
      rpcProvider,
      bundles,
      deploymentState.actionsExecuted.toNumber(),
      canonicalConfig
    )
  ) {
    logger.info(`[ChugSplash]: ${projectName} has sufficient funds`)

    // execute deployment
    try {
      const success = await executeTask({
        chugSplashManager: manager,
        deploymentState,
        bundles,
        executor: wallet,
        provider: rpcProvider,
        projectName,
        logger,
      })

      if (!success) {
        // This likely means one of the user's constructors reverted during execution. We already
        // logged the error inside `executeTask`, so we just discard the event and return.
        process.send({ action: 'discard', payload: executorEvent })
        return
      }
    } catch (e) {
      // check if the error was due to the deployment being claimed by another executor, and discard if so
      const errorDeploymentState: DeploymentState = await manager.deployments(
        activeDeploymentId
      )
      if (errorDeploymentState.selectedExecutor !== wallet.address) {
        logger.info(
          '[ChugSplash]: execution failed due to deployment being claimed by another executor'
        )
        process.send({ action: 'discard', payload: executorEvent })
        return
      }

      // log error
      logger.error(
        '[ChugSplash]: error: execution error',
        e,
        canonicalConfig.options
      )

      // retry the deployment later
      const retryEvent = generateRetryEvent(executorEvent)
      process.send({ action: 'retry', payload: retryEvent })
      return
    }

    // Update status in the ChugSplash managed database
    if (graphQLClient) {
      try {
        await updateDeployment(
          graphQLClient,
          activeDeploymentId,
          rpcProvider.network.chainId,
          'executed',
          []
        )
      } catch (error) {
        logger.error('[ChugSplash]: error: deployment update error', error)
      }
    }

    // verify on etherscan 10s later
    await tryVerification(
      logger,
      canonicalConfig,
      rpcProvider,
      projectName,
      network,
      graphQLClient,
      activeDeploymentId,
      1
    )

    await trackExecuted(
      await getProjectOwnerAddress(manager),
      organizationID,
      projectName,
      network,
      undefined
    )
  } else {
    logger.info(`[ChugSplash]: ${projectName} has insufficient funds`)

    // Continue to the next deployment if there is an insufficient amount of funds in the
    // ChugSplashManager. We will make attempts to execute the deployment on
    // subsequent iterations of the BaseService for up to 30 minutes.
    const retryEvent = generateRetryEvent(executorEvent, 100, 30000)
    process.send({ action: 'retry', payload: retryEvent })
    return
  }

  logger.info(`[ChugSplash]: claiming executor's payment...`)

  // Withdraw any debt owed to the executor. Note that even if a deployment is cancelled by the
  // project owner during execution, the executor will still be able to claim funds here.
  await claimExecutorPayment(wallet, manager)

  logger.info(`[ChugSplash]: claimed executor's payment`)

  // If we make it to this point, we know that the executor has executed the deployment (or that it
  // has been cancelled by the owner), and that the executor has claimed its payment.
  logger.info('[ChugSplash]: execution successful')
  process.send({ action: 'success', payload: executorEvent })
}
