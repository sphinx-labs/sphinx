import * as dotenv from 'dotenv'
dotenv.config()
import { ChugSplashManagerABI } from '@chugsplash/contracts'
import {
  CanonicalChugSplashConfig,
  ChugSplashBundleState,
  claimExecutorPayment,
  compileRemoteBundles,
  executeTask,
  ExecutorEvent,
  ExecutorKey,
  getGasPriceOverrides,
  getProjectOwnerAddress,
  hasSufficientFundsForExecution,
  trackExecuted,
  computeBundleId,
  ChugSplashBundles,
  isSupportedNetworkOnEtherscan,
  verifyChugSplashConfig,
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

  // get active bundle id for this project
  const activeBundleId = await manager.activeBundleId()

  const bundleState: ChugSplashBundleState = await manager.bundles(
    activeBundleId
  )

  if (!bundleState.remoteExecution) {
    logger.info('[ChugSplash]: skipping local bundle')
    process.send({ action: 'discard', payload: executorEvent })
    return
  } else if (activeBundleId === ethers.constants.HashZero) {
    logger.info('[ChugSplash]: no active bundle in project')
    process.send({ action: 'discard', payload: executorEvent })
    return
  }

  // Retrieve the corresponding proposal event to get the config URI.
  const [proposalEvent] = await manager.queryFilter(
    manager.filters.ChugSplashBundleProposed(activeBundleId)
  )

  logger.info('[ChugSplash]: retrieving the bundle...')
  // Compile the bundle using either the provided localBundleId (when running the in-process
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

  const expectedBundleId = computeBundleId(
    bundles.actionBundle.root,
    bundles.targetBundle.root,
    bundles.actionBundle.actions.length,
    bundles.targetBundle.targets.length,
    proposalEvent.args.configUri
  )

  // ensure compiled bundle ID matches proposed bundle ID
  if (expectedBundleId !== proposalEvent.args.bundleId) {
    // We cannot execute the current bundle, so we dicard the event
    // Discarding the event causes the parent process to remove this event from its cache of events currently being executed
    process.send({ action: 'discard', payload: executorEvent })

    // log error and return
    logger.error(
      '[ChugSplash]: error: compiled bundle root does not match proposal event bundle root',
      canonicalConfig.options
    )
    return
  }

  logger.info(`[ChugSplash]: compiled ${projectName} on: ${network}.`)

  if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
    try {
      await (
        await manager.claimBundle(await getGasPriceOverrides(rpcProvider))
      ).wait()
    } catch (err) {
      if (
        err.message.includes(
          'ChugSplashManager: bundle is currently claimed by an executor'
        )
      ) {
        logger.info(
          '[ChugSplash]: a different executor claimed the bundle right before this executor'
        )

        // Do not retry the bundle since it will be handled by another executor
        process.send({ action: 'discard', payload: executorEvent })
      } else {
        // A different error occurred. This most likely means the owner cancelled the bundle
        // before it could be claimed. We'll log the error message.
        logger.error(
          '[ChugSplash]: error: claiming bundle error',
          err,
          canonicalConfig.options
        )

        // retry events which failed due to other errors
        const retryEvent = generateRetryEvent(executorEvent)
        process.send({ action: 'retry', payload: retryEvent })
      }

      // Since we can't execute the bundle, return
      return
    }
  } else if (bundleState.selectedExecutor !== wallet.address) {
    logger.info(
      '[ChugSplash]: a different executor has already claimed the bundle'
    )
    return
  }

  // If we make it to the point, we know that this executor is selected to claim the bundle.

  logger.info(`[ChugSplash]: checking that the project is funded...`)

  if (
    await hasSufficientFundsForExecution(
      rpcProvider,
      bundles,
      bundleState.actionsExecuted.toNumber(),
      canonicalConfig
    )
  ) {
    logger.info(`[ChugSplash]: ${projectName} has sufficient funds`)

    // execute bundle
    try {
      await executeTask({
        chugSplashManager: manager,
        bundleState,
        bundles,
        executor: wallet,
        provider: rpcProvider,
        projectName,
        logger,
      })
    } catch (e) {
      // check if the error was due to the bundle being claimed by another executor, and discard if so
      const errorBundleState: ChugSplashBundleState = await manager.bundles(
        activeBundleId
      )
      if (errorBundleState.selectedExecutor !== wallet.address) {
        logger.info(
          '[ChugSplash]: execution failed due to bundle being claimed by another executor'
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

      // retry the bundle later
      const retryEvent = generateRetryEvent(executorEvent)
      process.send({ action: 'retry', payload: retryEvent })
      return
    }

    // Update status in the ChugSplash managed database
    if (graphQLClient) {
      try {
        await updateDeployment(graphQLClient, activeBundleId, 'executed', [])
      } catch (error) {
        logger.error('[ChugSplash]: error: deployment update error', error)
      }
    }
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
      logger.error(
        '[ChugSplash]: error: verification error',
        e,
        canonicalConfig.options
      )
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
            address: contractConfig.proxy,
          })
        }
      )

      try {
        await updateDeployment(
          graphQLClient,
          activeBundleId,
          'verified',
          contracts
        )
      } catch (error) {
        logger.error('[ChugSplash]: error: deployment update error', error)
      }
    }

    await trackExecuted(
      await getProjectOwnerAddress(manager),
      organizationID,
      projectName,
      network,
      undefined
    )
  } else {
    logger.info(`[ChugSplash]: ${projectName} has insufficient funds`)

    // Continue to the next bundle if there is an insufficient amount of funds in the
    // ChugSplashManager. We will make attempts to execute the bundle on
    // subsequent iterations of the BaseService for up to 30 minutes.
    const retryEvent = generateRetryEvent(executorEvent, 100, 30000)
    process.send({ action: 'retry', payload: retryEvent })
    return
  }

  logger.info(`[ChugSplash]: claiming executor's payment...`)

  // Withdraw any debt owed to the executor. Note that even if a bundle is cancelled by the
  // project owner during execution, the executor will still be able to claim funds here.
  await claimExecutorPayment(wallet, manager)

  logger.info(`[ChugSplash]: claimed executor's payment`)

  // If we make it to this point, we know that the executor has executed the bundle (or that it
  // has been cancelled by the owner), and that the executor has claimed its payment.
  logger.info('[ChugSplash]: execution successful')
  process.send({ action: 'success', payload: executorEvent })
}
