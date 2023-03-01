import { ChugSplashManagerABI } from '@chugsplash/contracts'
import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  claimExecutorPayment,
  compileRemoteBundle,
  executeTask,
  ExecutorEvent,
  ExecutorKey,
  getGasPriceOverrides,
  getProjectOwnerAddress,
  hasSufficientFundsForExecution,
  Integration,
  readCanonicalConfig,
  trackExecuted,
  bundleRemoteSubtask,
} from '@chugsplash/core'
import { Logger, LogLevel, LoggerOptions } from '@eth-optimism/common-ts'
import { getChainId } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import { GraphQLClient } from 'graphql-request'

import { updateDeployment } from '../gql'
import {
  isSupportedNetworkOnEtherscan,
  verifyChugSplashConfig,
} from './etherscan'

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
  remoteExecution: boolean
  canonicalConfigFolderPath: string
  network: string
  managedApiUrl: string
  managedPublicKey: string | undefined
  integration: Integration
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
    remoteExecution,
    canonicalConfigFolderPath,
    network,
    managedApiUrl,
    managedPublicKey,
    integration,
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
  if (activeBundleId === ethers.constants.HashZero) {
    logger.info('[ChugSplash]: no active bundle in project')
    if (remoteExecution) {
      process.send({ action: 'discard', payload: executorEvent })
    }
  } else {
    // Retrieve the corresponding proposal event to get the config URI.
    const [proposalEvent] = await manager.queryFilter(
      manager.filters.ChugSplashBundleProposed(activeBundleId)
    )

    logger.info('[ChugSplash]: retrieving the bundle...')
    // Compile the bundle using either the provided localBundleId (when running the in-process
    // executor), or using the Config URI
    let bundle: ChugSplashActionBundle
    let canonicalConfig: CanonicalChugSplashConfig

    // Handle if the config cannot be fetched
    if (remoteExecution) {
      ;({ bundle, canonicalConfig } = await compileRemoteBundle(
        rpcProvider,
        proposalEvent.args.configUri
      ))
    } else {
      canonicalConfig = readCanonicalConfig(
        canonicalConfigFolderPath,
        proposalEvent.args.configUri
      )
      bundle = await bundleRemoteSubtask({
        provider: rpcProvider,
        canonicalConfig,
      })
    }
    const projectName = canonicalConfig.options.projectName

    // ensure compiled bundle matches proposed bundle
    if (bundle.root !== proposalEvent.args.bundleRoot) {
      // We cannot execute the current bundle, so we dicard the event
      // Discarding the event causes the parent process to remove this event from its cache of events currently being executed
      if (remoteExecution) {
        process.send({ action: 'discard', payload: executorEvent })
      }

      // log error and return
      logger.error(
        '[ChugSplash]: error: compiled bundle root does not match proposal event bundle root',
        canonicalConfig.options
      )
      return
    }

    logger.info(`[ChugSplash]: compiled ${projectName} on: ${network}.`)

    const bundleState: ChugSplashBundleState = await manager.bundles(
      activeBundleId
    )

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
          if (remoteExecution) {
            process.send({ action: 'discard', payload: executorEvent })
          }
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
          if (remoteExecution) {
            process.send({ action: 'retry', payload: retryEvent })
          }
        }

        // Since we can't execute the bundle, return
        return
      }
    } else if (bundleState.selectedExecutor !== wallet.address) {
      logger.info(
        '[ChugSplash]: a different executor has already claimed the bundle'
      )
    }

    // If we make it to the point, we know that this executor is selected to claim the bundle.

    logger.info(`[ChugSplash]: checking that the project is funded...`)

    if (
      await hasSufficientFundsForExecution(
        rpcProvider,
        bundle,
        bundleState.actionsExecuted.toNumber(),
        projectName
      )
    ) {
      logger.info(`[ChugSplash]: ${projectName} has sufficient funds`)
      // execute bundle
      try {
        await executeTask({
          chugSplashManager: manager,
          bundleState,
          bundle,
          executor: wallet,
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
          if (remoteExecution) {
            process.send({ action: 'discard', payload: executorEvent })
          }
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
        if (remoteExecution) {
          process.send({ action: 'retry', payload: retryEvent })
        }
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
        if (
          isSupportedNetworkOnEtherscan(
            remoteExecution && (await getChainId(rpcProvider))
          )
        ) {
          logger.info(
            `[ChugSplash]: attempting to verify source code on etherscan for project: ${projectName}`
          )
          await verifyChugSplashConfig(
            proposalEvent.args.configUri,
            rpcProvider,
            network
          )
          logger.info(
            `[ChugSplash]: finished attempting etherscan verification for project: ${projectName}`
          )
        } else {
          logger.info(
            `[ChugSplash]: skipped verifying project: ${projectName}. reason: etherscan config not detected for network: ${network}`
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

      trackExecuted(
        await getProjectOwnerAddress(wallet, projectName),
        projectName,
        network,
        integration
      )
    } else {
      logger.info(`[ChugSplash]: ${projectName} has insufficient funds`)

      // Continue to the next bundle if there is an insufficient amount of funds in the
      // ChugSplashManager. We will make attempts to execute the bundle on
      // subsequent iterations of the BaseService for up to 30 minutes.
      const retryEvent = generateRetryEvent(executorEvent, 100, 30000)
      if (remoteExecution) {
        process.send({ action: 'retry', payload: retryEvent })
      }
      return
    }

    logger.info(`[ChugSplash]: claiming executor's payment...`)

    // Withdraw any debt owed to the executor. Note that even if a bundle is cancelled by the
    // project owner during execution, the executor will still be able to claim funds here.
    await claimExecutorPayment(wallet, manager)

    logger.info(`[ChugSplash]: claimed executor's payment`)

    // If we make it to this point, we know that the executor has executed the bundle (or that it
    // has been cancelled by the owner), and that the executor has claimed its payment.
    if (remoteExecution) {
      logger.info('[ChugSplash]: execution successful')
      process.send({ action: 'success', payload: executorEvent })
    }
  }
}
