import * as dotenv from 'dotenv'
dotenv.config()
import { ManagedServiceABI, SphinxManagerABI } from '@sphinx-labs/contracts'
import {
  DeploymentState,
  compileRemoteBundles,
  executeDeployment,
  getGasPriceOverrides,
  trackExecuted,
  getDeploymentId,
  SphinxBundles,
  isSupportedNetworkOnEtherscan,
  verifySphinxConfig,
  deploymentDoesRevert,
  CompilerConfig,
  ConfigArtifacts,
  estimateExecutionCost,
  getManagedServiceAddress,
  SphinxJsonRpcProvider,
  HumanReadableActions,
} from '@sphinx-labs/core'
import { Logger, LogLevel, LoggerOptions } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import { GraphQLClient } from 'graphql-request'

import { ExecutorEvent, ExecutorKey } from '../types'
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
    eventInfo: event.eventInfo,
  }
}

const tryVerification = async (
  logger: Logger,
  compilerConfig: CompilerConfig,
  configArtifacts: ConfigArtifacts,
  rpcProvider: SphinxJsonRpcProvider,
  projectName: string,
  network: string,
  graphQLClient: GraphQLClient,
  activeDeploymentId: string,
  attempts: number = 0
) => {
  // verify on etherscan
  try {
    if (isSupportedNetworkOnEtherscan(rpcProvider)) {
      const apiKey = process.env.ETHERSCAN_API_KEY
      if (apiKey) {
        logger.info(
          `[Sphinx]: attempting to verify source code on etherscan for projectName: ${projectName}`
        )
        await verifySphinxConfig(
          compilerConfig,
          configArtifacts,
          rpcProvider,
          network,
          apiKey
        )
        logger.info(
          `[Sphinx]: finished attempting etherscan verification for projectName: ${projectName}`
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
          compilerConfig,
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
    Object.entries(compilerConfig.contracts).forEach(
      ([referenceName, contractConfig]) => {
        contracts.push({
          referenceName,
          contractName: contractConfig.contract,
          address: contractConfig.address,
        })
      }
    )

    try {
      const { chainId } = await rpcProvider.getNetwork()
      await updateDeployment(
        graphQLClient,
        activeDeploymentId,
        Number(chainId),
        'verified',
        contracts,
        []
      )
    } catch (error) {
      logger.error('[Sphinx]: error: deployment update error', error)
    }
  }
}

export type ExecutorMessage = {
  executorEvent: ExecutorEvent
  key: ExecutorKey
  provider: SphinxJsonRpcProvider | string
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
  const { managerAddress } = executorEvent.eventInfo

  const logger = new Logger(loggerOptions)

  let graphQLClient: GraphQLClient | undefined
  // Setup GraphQL Client if the api url and public key are specified
  if (managedApiUrl !== '' && managedPublicKey) {
    graphQLClient = new GraphQLClient(managedApiUrl, {
      headers: {},
    })
  }

  let rpcProvider: SphinxJsonRpcProvider
  if (typeof provider === 'string') {
    rpcProvider = new SphinxJsonRpcProvider(provider)
  } else {
    rpcProvider = provider
  }

  const wallet = new ethers.Wallet(key.privateKey, rpcProvider)

  // fetch manager for relevant project
  const manager = new ethers.Contract(managerAddress, SphinxManagerABI, wallet)

  // get active deployment ID for this project
  const activeDeploymentId = await manager.activeDeploymentId()

  const deploymentState: DeploymentState = await manager.deployments(
    activeDeploymentId
  )

  if (!deploymentState.remoteExecution) {
    logger.info('[Sphinx]: skipping local deployment')
    process.send({ action: 'discard', payload: executorEvent })
    return
  } else if (activeDeploymentId === ethers.ZeroHash) {
    logger.info('[Sphinx]: no active deployment in project')
    process.send({ action: 'discard', payload: executorEvent })
    return
  }

  logger.info('[Sphinx]: retrieving the deployment...')
  // Compile the bundle using either the provided localDeploymentId (when running the in-process
  // executor), or using the Config URI
  let bundles: SphinxBundles
  let compilerConfig: CompilerConfig
  let configArtifacts: ConfigArtifacts
  let humanReadableActions: HumanReadableActions

  // Handle if the config cannot be fetched
  try {
    ;({ bundles, compilerConfig, configArtifacts, humanReadableActions } =
      await compileRemoteBundles(rpcProvider, deploymentState.configUri))
  } catch (e) {
    logger.error(`Error compiling bundle: ${e}`)
    // retry events which failed due to compilation issues (usually this is if the compiler was not able to be downloaded)
    const retryEvent = generateRetryEvent(executorEvent)
    process.send({ action: 'retry', payload: retryEvent })
  }
  const { projectName } = compilerConfig

  // Get estimated cost + 50% buffer and withdraw from balance contract if below that cost
  const estimatedCost =
    ((await estimateExecutionCost(managerAddress, rpcProvider, bundles, 0)) *
      15n) /
    10n
  const balance = await rpcProvider.getBalance(wallet.address)
  if (balance < estimatedCost) {
    logger.info(
      `[Relayer]: Wallet balance low, withdrawing from ManagedService contract`
    )
    // check if managed service has funds
    const { chainId } = await rpcProvider.getNetwork()
    const managedServiceAddress = getManagedServiceAddress(Number(chainId))
    const withdraw = (estimatedCost * 200n) / 100n
    // Log an error if not
    if ((await rpcProvider.getBalance(managedServiceAddress)) < withdraw) {
      throw new Error(
        'Failed to withdraw new funds from managed service contract, insufficent balance'
      )
    } else {
      // Otherwise, withdraw funds
      const ManagedService = new ethers.Contract(
        managedServiceAddress,
        ManagedServiceABI,
        wallet
      )
      await (
        await ManagedService.withdrawRelayerFunds(
          withdraw,
          await getGasPriceOverrides(wallet)
        )
      ).wait()
      logger.info(
        `[Relayer]: Withdrew from ManagedService contract successfully`
      )
    }
  }

  const expectedDeploymentId = getDeploymentId(
    bundles,
    deploymentState.configUri
  )

  // ensure compiled deployment ID matches proposed deployment ID
  if (expectedDeploymentId !== activeDeploymentId) {
    // We cannot execute the current deployment, so we dicard the event
    // Discarding the event causes the parent process to remove this event from its cache of events currently being executed
    process.send({ action: 'discard', payload: executorEvent })

    // log error and return
    logger.error(
      '[Sphinx]: error: compiled deployment id does not match proposal event deployment id',
      activeDeploymentId
    )
    return
  }

  logger.info(`[Sphinx]: compiled ${projectName} on: ${network}.`)

  const deploymentTransactionReceipts: ethers.TransactionReceipt[] = []

  if (deploymentState.selectedExecutor === ethers.ZeroAddress) {
    logger.info(`[Sphinx]: checking if any of the constructors revert...`)

    if (
      await deploymentDoesRevert(
        rpcProvider,
        managerAddress,
        bundles.actionBundle,
        Number(deploymentState.actionsExecuted)
      )
    ) {
      process.send({ action: 'discard', payload: executorEvent })
      return
    }

    try {
      deploymentTransactionReceipts.push(
        await (
          await manager.claimDeployment(await getGasPriceOverrides(wallet))
        ).wait()
      )
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
          expectedDeploymentId
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

  // execute deployment
  try {
    const { gasLimit: blockGasLimit } = await rpcProvider.getBlock('latest')
    const { success, receipts } = await executeDeployment(
      manager,
      bundles,
      activeDeploymentId,
      humanReadableActions,
      blockGasLimit,
      rpcProvider,
      wallet
    )
    deploymentTransactionReceipts.push(...receipts)

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
    logger.error('[Sphinx]: error: execution error', e, expectedDeploymentId)

    // retry the deployment later
    const retryEvent = generateRetryEvent(executorEvent)
    process.send({ action: 'retry', payload: retryEvent })
    return
  }

  // Update status in the Sphinx managed database
  if (graphQLClient) {
    try {
      const { chainId } = await rpcProvider.getNetwork()
      await updateDeployment(
        graphQLClient,
        activeDeploymentId,
        Number(chainId),
        'executed',
        [],
        deploymentTransactionReceipts.map((receipt) => {
          return {
            txHash: receipt.hash,
            cost: (receipt.gasUsed * receipt.gasPrice).toString(),
            chainId: Number(chainId),
          }
        })
      )
    } catch (error) {
      logger.error('[Sphinx]: error: deployment update error', error)
    }
  }

  // verify on etherscan 10s later
  await tryVerification(
    logger,
    compilerConfig,
    configArtifacts,
    rpcProvider,
    projectName,
    network,
    graphQLClient,
    activeDeploymentId,
    1
  )

  await trackExecuted(await manager.owner(), network, undefined)

  // If we make it to this point, we know that the executor has executed the deployment (or that it
  // has been cancelled by the owner).
  logger.info('[Sphinx]: execution successful')
  process.send({ action: 'success', payload: executorEvent })
}
