import * as dotenv from 'dotenv'
dotenv.config()
import { SphinxManagerABI } from '@sphinx/contracts'
import {
  DeploymentState,
  claimExecutorPayment,
  compileRemoteBundles,
  executeDeployment,
  ExecutorEvent,
  ExecutorKey,
  getGasPriceOverrides,
  hasSufficientFundsForExecution,
  trackExecuted,
  getDeploymentId,
  SphinxBundles,
  isSupportedNetworkOnEtherscan,
  verifySphinxConfig,
  deploymentDoesRevert,
  CanonicalProjectConfig,
  ProjectConfigArtifacts,
} from '@sphinx/core'
import { Logger, LogLevel, LoggerOptions } from '@eth-optimism/common-ts'
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
  waitingPeriodMs: number = 10000
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
  canonicalConfig: CanonicalProjectConfig,
  configArtifacts: ProjectConfigArtifacts,
  rpcProvider: ethers.providers.JsonRpcProvider,
  projectName: string,
  network: string,
  graphQLClient: GraphQLClient,
  activeDeploymentId: string,
  attempts: number = 0
) => {
  // verify on etherscan
  try {
    if (isSupportedNetworkOnEtherscan(network)) {
      const apiKey = process.env.ETHERSCAN_API_KEY
      if (apiKey) {
        logger.info(
          `[Sphinx]: attempting to verify source code on etherscan for project: ${projectName}`
        )
        await verifySphinxConfig(
          canonicalConfig,
          configArtifacts,
          rpcProvider,
          network,
          apiKey
        )
        logger.info(
          `[Sphinx]: finished attempting etherscan verification for project: ${projectName}`
        )
      } else {
        logger.info(
          `[Sphinx]: skipped verifying sphinx contracts. reason: no api key found`
        )
      }
    } else {
      logger.info(
        `[Sphinx]: skipped verifying sphinx contracts. reason: etherscan config not detected for: ${network}`
      )
    }
  } catch (e) {
    logger.error('[Sphinx]: error: verification error', e)
    if (attempts < 6) {
      // Try again in 30 seconds
      setTimeout(async () => {
        await tryVerification(
          logger,
          canonicalConfig,
          configArtifacts,
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

  // Update status in the Sphinx managed database
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
      logger.error('[Sphinx]: error: deployment update error', error)
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
  const manager = new ethers.Contract(managedAddress, SphinxManagerABI, wallet)

  // get active deployment ID for this project
  const activeDeploymentId = await manager.activeDeploymentId()

  const deploymentState: DeploymentState = await manager.deployments(
    activeDeploymentId
  )

  if (!deploymentState.remoteExecution) {
    logger.info('[Sphinx]: skipping local deployment')
    process.send({ action: 'discard', payload: executorEvent })
    return
  } else if (activeDeploymentId === ethers.constants.HashZero) {
    logger.info('[Sphinx]: no active deployment in project')
    process.send({ action: 'discard', payload: executorEvent })
    return
  }

  // Retrieve the corresponding approval event to get the config URI.
  const [approvalEvent] = await manager.queryFilter(
    manager.filters.SphinxDeploymentApproved(activeDeploymentId)
  )

  logger.info('[Sphinx]: retrieving the deployment...')
  // Compile the bundle using either the provided localDeploymentId (when running the in-process
  // executor), or using the Config URI
  let bundles: SphinxBundles
  let canonicalProjectConfig: CanonicalProjectConfig
  let projectConfigArtifacts: ProjectConfigArtifacts

  // Handle if the config cannot be fetched
  try {
    ;({ bundles, canonicalProjectConfig, projectConfigArtifacts } =
      await compileRemoteBundles(rpcProvider, approvalEvent.args.configUri))
  } catch (e) {
    logger.error(`Error compiling bundle: ${e}`)
    // retry events which failed due to compilation issues (usually this is if the compiler was not able to be downloaded)
    const retryEvent = generateRetryEvent(executorEvent)
    process.send({ action: 'retry', payload: retryEvent })
  }
  const { project } = canonicalProjectConfig.options

  const expectedDeploymentId = getDeploymentId(
    bundles,
    approvalEvent.args.configUri,
    project
  )

  // ensure compiled deployment ID matches proposed deployment ID
  if (expectedDeploymentId !== approvalEvent.args.deploymentId) {
    // We cannot execute the current deployment, so we dicard the event
    // Discarding the event causes the parent process to remove this event from its cache of events currently being executed
    process.send({ action: 'discard', payload: executorEvent })

    // log error and return
    logger.error(
      '[Sphinx]: error: compiled deployment id does not match proposal event deployment id',
      canonicalProjectConfig.options
    )
    return
  }

  logger.info(`[Sphinx]: compiled ${project} on: ${network}.`)

  if (deploymentState.selectedExecutor === ethers.constants.AddressZero) {
    logger.info(`[Sphinx]: checking if any of the constructors revert...`)

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
          'SphinxManager: deployment is currently claimed by an executor'
        )
      ) {
        logger.info(
          '[Sphinx]: a different executor claimed the deployment right before this executor'
        )

        // Do not retry the deployment since it will be handled by another executor
        process.send({ action: 'discard', payload: executorEvent })
      } else {
        // A different error occurred. This most likely means the owner cancelled the deployment
        // before it could be claimed. We'll log the error message.
        logger.error(
          '[Sphinx]: error: claiming deployment error',
          err,
          canonicalProjectConfig.options
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
      '[Sphinx]: a different executor has already claimed the deployment'
    )
    return
  }

  // If we make it to the point, we know that this executor is selected to claim the deployment and
  // that the deployment should execute without an error (i.e. a constructor reverting).

  logger.info(`[Sphinx]: constructors probably won't revert.`)

  logger.info(`[Sphinx]: checking that the project is funded...`)

  if (
    await hasSufficientFundsForExecution(
      rpcProvider,
      bundles,
      deploymentState.actionsExecuted.toNumber(),
      canonicalProjectConfig
    )
  ) {
    logger.info(`[Sphinx]: ${project} has sufficient funds`)

    // execute deployment
    try {
      const { gasLimit: blockGasLimit } = await rpcProvider.getBlock('latest')
      const success = await executeDeployment(
        manager,
        bundles,
        blockGasLimit,
        projectConfigArtifacts,
        rpcProvider
      )

      if (!success) {
        // This likely means one of the user's constructors reverted during execution. We already
        // logged the error inside `executeDeployment`, so we just discard the event and return.
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
          '[Sphinx]: execution failed due to deployment being claimed by another executor'
        )
        process.send({ action: 'discard', payload: executorEvent })
        return
      }

      // log error
      logger.error(
        '[Sphinx]: error: execution error',
        e,
        canonicalProjectConfig.options
      )

      // retry the deployment later
      const retryEvent = generateRetryEvent(executorEvent)
      process.send({ action: 'retry', payload: retryEvent })
      return
    }

    // Update status in the Sphinx managed database
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
        logger.error('[Sphinx]: error: deployment update error', error)
      }
    }

    // verify on etherscan 10s later
    await tryVerification(
      logger,
      canonicalProjectConfig,
      projectConfigArtifacts,
      rpcProvider,
      project,
      network,
      graphQLClient,
      activeDeploymentId,
      1
    )

    await trackExecuted(await manager.owner(), network, undefined)
  } else {
    logger.info(`[Sphinx]: ${project} has insufficient funds`)

    // Continue to the next deployment if there is an insufficient amount of funds in the
    // SphinxManager. We will make attempts to execute the deployment on
    // subsequent iterations of the BaseService for up to 30 minutes.
    const retryEvent = generateRetryEvent(executorEvent, 100, 30000)
    process.send({ action: 'retry', payload: retryEvent })
    return
  }

  logger.info(`[Sphinx]: claiming executor's payment...`)

  // Withdraw any debt owed to the executor. Note that even if a deployment is cancelled by the
  // project owner during execution, the executor will still be able to claim funds here.
  await claimExecutorPayment(wallet, manager)

  logger.info(`[Sphinx]: claimed executor's payment`)

  // If we make it to this point, we know that the executor has executed the deployment (or that it
  // has been cancelled by the owner), and that the executor has claimed its payment.
  logger.info('[Sphinx]: execution successful')
  process.send({ action: 'success', payload: executorEvent })
}
