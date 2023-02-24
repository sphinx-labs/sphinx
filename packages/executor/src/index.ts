import * as dotenv from 'dotenv'
dotenv.config()
import {
  BaseServiceV2,
  Logger,
  StandardOptions,
  validators,
} from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import {
  ChugSplashManagerABI,
  ChugSplashRecorderABI,
  CHUGSPLASH_RECORDER_ADDRESS,
} from '@chugsplash/contracts'
import {
  claimExecutorPayment,
  hasSufficientFundsForExecution,
  executeTask,
  CanonicalChugSplashConfig,
  initializeChugSplash,
  getProjectOwnerAddress,
  ChugSplashBundleState,
  ChugSplashActionBundle,
  readCanonicalConfig,
  trackExecuted,
  Integration,
  compileRemoteBundle,
  bundleRemoteSubtask,
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState,
  getGasPriceOverrides,
  ExecutorEvent,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { GraphQLClient } from 'graphql-request'

import {
  verifyChugSplash,
  verifyChugSplashConfig,
  isSupportedNetworkOnEtherscan,
} from './utils'
import { updateDeployment } from './gql'

export * from './utils'

const generateRetryEvent = (
  event: ExecutorEvent,
  timesToRetry: number = 5,
  waitingPeriodMs?: number
): ExecutorEvent | undefined => {
  if (event.retry >= timesToRetry) {
    return undefined
  }

  let eventWaitingPeriodMs = waitingPeriodMs
  if (!eventWaitingPeriodMs) {
    eventWaitingPeriodMs = 2 * event.waitingPeriodMs
  }

  const now = new Date().getMilliseconds()
  const nextTryMs = now + eventWaitingPeriodMs
  const nextTryDate = new Date(nextTryMs)
  return {
    nextTry: nextTryDate,
    retry: event.retry + 1,
    waitingPeriodMs: eventWaitingPeriodMs,
    event: event.event,
  }
}

export class ChugSplashExecutor extends BaseServiceV2<
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState & {
    graphQLClient: GraphQLClient
  }
> {
  constructor(options?: Partial<ExecutorOptions & StandardOptions>) {
    super({
      name: 'chugsplash-executor',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version: require('../package.json').version,
      loop: true,
      options: {
        loopIntervalMs: 5000,
        ...options,
      },
      optionsSpec: {
        url: {
          desc: 'Target deployment network access url',
          validator: validators.str,
          default: 'http://localhost:8545',
        },
        network: {
          desc: 'Target deployment network name',
          validator: validators.str,
          default: 'localhost',
        },
        privateKey: {
          desc: 'Private key for signing deployment transactions',
          validator: validators.str,
          default:
            '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e',
        },
        logLevel: {
          desc: 'Executor log level',
          validator: validators.str,
          default: 'error',
        },
        managedApiUrl: {
          desc: 'ChugSplash Managed GraphQL API',
          validator: validators.str,
          default: '',
        },
      },
      metricsSpec: {},
    })
  }

  /**
   * Passing options into BaseServiceV2 when running programmatically does not work as expected.
   *
   * So this setup function is shared between the init() and main() functions and allows the user
   * to pass options into the main() function, or run the executor as a service and pass in options using
   * environment variables.
   **/
  async setup(
    options: Partial<ExecutorOptions>,
    provider?: ethers.providers.JsonRpcProvider
  ) {
    this.logger = new Logger({
      name: 'Logger',
      level: options.logLevel,
    })

    this.state.provider =
      provider ?? new ethers.providers.JsonRpcProvider(options.url)
    this.state.recorder = new ethers.Contract(
      CHUGSPLASH_RECORDER_ADDRESS,
      ChugSplashRecorderABI,
      this.state.provider
    )
    this.state.lastBlockNumber = 0

    // Passing the log level in when creating executor still does not work as expected.
    // If you attempt to remove this, the foundry library will fail due to incorrect output to the console.
    // This is because the foundry library parses stdout and expects a very specific format.
    this.logger = new Logger({
      name: 'Logger',
      level: options.logLevel,
    })

    // This represents a queue of "BundleApproved" events to execute.
    this.state.eventsQueue = []

    this.state.wallet = new ethers.Wallet(
      options.privateKey,
      this.state.provider
    )
  }

  async init() {
    await this.setup(this.options)

    this.logger.info('[ChugSplash]: setting up chugsplash...')

    // Deploy the ChugSplash contracts.
    await initializeChugSplash(
      this.state.provider,
      this.state.wallet,
      this.state.wallet.address,
      this.logger
    )

    this.logger.info('[ChugSplash]: finished setting up chugsplash')

    // verify ChugSplash contracts on etherscan
    try {
      // Verify the ChugSplash contracts if the current network is supported.
      if (
        isSupportedNetworkOnEtherscan(await getChainId(this.state.provider))
      ) {
        this.logger.info(
          '[ChugSplash]: attempting to verify the chugsplash contracts...'
        )
        await verifyChugSplash(this.state.provider, this.options.network)
        this.logger.info(
          '[ChugSplash]: finished attempting to verify the chugsplash contracts'
        )
      } else {
        this.logger.info(
          `[ChugSplash]: skipped verifying chugsplash contracts. reason: etherscan config not detected for: ${this.options.network}`
        )
      }
    } catch (e) {
      this.logger.error(
        `[ChugSplash]: error: failed to verify chugsplash contracts on ${this.options.network}`,
        e
      )
    }

    // Setup GraphQL Client if the api url and public key are specified
    if (this.options.managedApiUrl !== '' && process.env.MANAGED_PUBLIC_KEY) {
      this.state.graphQLClient = new GraphQLClient(this.options.managedApiUrl, {
        headers: {},
      })
    }
  }

  async main(
    canonicalConfigFolderPath?: string,
    integration?: Integration,
    remoteExecution: boolean = true
  ) {
    const { provider, wallet, recorder } = this.state

    const latestBlockNumber = await provider.getBlockNumber()

    // Handles an edge case with retries that can only occur
    // when running the executor against a local network that
    // does not use interval mining (i.e the default hardhat network)
    if (this.state.lastBlockNumber > latestBlockNumber) {
      return
    }

    // Get approval events in blocks after the stored block number
    const newApprovalEvents = await recorder.queryFilter(
      recorder.filters.EventAnnounced('ChugSplashBundleApproved'),
      this.state.lastBlockNumber,
      latestBlockNumber
    )

    const currentTime = new Date()
    const newExecutorEvents: ExecutorEvent[] = newApprovalEvents.map(
      (event) => {
        return {
          retry: 1,
          nextTry: currentTime,
          waitingPeriodMs: 15000,
          event,
        }
      }
    )

    // Concatenate the new approval events to the array
    this.state.eventsQueue = this.state.eventsQueue.concat(newExecutorEvents)

    // store last block number
    this.state.lastBlockNumber = latestBlockNumber

    // If none found, return
    if (this.state.eventsQueue.length === 0) {
      this.logger.info('[ChugSplash]: no projects found')
      return
    }

    this.logger.info(
      `[ChugSplash]: total number of events: ${this.state.eventsQueue.length}. new events: ${newApprovalEvents.length}`
    )

    // Create a copy of the events queue, which we will iterate over. It's necessary to create a
    // copy because we will be re-arranging the order of the elements in the `eventsQueue` during
    // execution, and we only want to attempt to execute each element once.
    const eventsCopy = this.state.eventsQueue.slice()

    // execute all approved bundles
    for (const executorEvent of eventsCopy) {
      this.logger.info('[ChugSplash]: detected a project...')

      // If still waiting on retry, then continue
      if (executorEvent.nextTry > currentTime) {
        continue
      }

      // Remove the current event from the front of the events queue and place it at the end of the
      // array. This ensures that the current event won't block the execution of other events if
      // we're unable to execute it.
      this.state.eventsQueue.shift()
      this.state.eventsQueue.push(executorEvent)

      // fetch manager for relevant project
      const manager = new ethers.Contract(
        executorEvent.event.args.manager,
        ChugSplashManagerABI,
        wallet
      )

      // get active bundle id for this project
      const activeBundleId = await manager.activeBundleId()
      if (activeBundleId === ethers.constants.HashZero) {
        this.logger.info('[ChugSplash]: no active bundle in project')
      } else {
        // Retrieve the corresponding proposal event to get the config URI.
        const [proposalEvent] = await manager.queryFilter(
          manager.filters.ChugSplashBundleProposed(activeBundleId)
        )

        this.logger.info('[ChugSplash]: retrieving the bundle...')
        // Compile the bundle using either the provided localBundleId (when running the in-process
        // executor), or using the Config URI
        let bundle: ChugSplashActionBundle
        let canonicalConfig: CanonicalChugSplashConfig

        // Handle if the config cannot be fetched
        if (remoteExecution) {
          ;({ bundle, canonicalConfig } = await compileRemoteBundle(
            provider,
            proposalEvent.args.configUri
          ))
        } else {
          canonicalConfig = readCanonicalConfig(
            canonicalConfigFolderPath,
            proposalEvent.args.configUri
          )
          bundle = await bundleRemoteSubtask({ provider, canonicalConfig })
        }
        const projectName = canonicalConfig.options.projectName

        // ensure compiled bundle matches proposed bundle
        if (bundle.root !== proposalEvent.args.bundleRoot) {
          // We cannot execute the current bundle, so we remove the corresponding event from the end
          // of the events queue.
          this.state.eventsQueue.pop()

          // log error and continue
          this.logger.error(
            '[ChugSplash]: error: compiled bundle root does not match proposal event bundle root',
            canonicalConfig.options
          )
          continue
        }

        this.logger.info(
          `[ChugSplash]: compiled ${projectName} on: ${this.options.network}.`
        )

        const bundleState: ChugSplashBundleState = await manager.bundles(
          activeBundleId
        )

        if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
          try {
            await (
              await manager.claimBundle(await getGasPriceOverrides(provider))
            ).wait()
          } catch (err) {
            if (
              err.message.includes(
                'ChugSplashManager: bundle is currently claimed by an executor'
              )
            ) {
              this.logger.info(
                '[ChugSplash]: a different executor claimed the bundle right before this executor'
              )

              // Do not retry the bundle since it will be handled by another executor
              this.state.eventsQueue.pop()
            } else {
              // A different error occurred. This most likely means the owner cancelled the bundle
              // before it could be claimed. We'll log the error message.
              this.logger.error(
                '[ChugSplash]: error: claiming bundle error',
                err,
                canonicalConfig.options
              )

              // retry events which failed due to other errors
              const event = this.state.eventsQueue.pop()
              const retryEvent = generateRetryEvent(event)
              if (retryEvent !== undefined) {
                this.state.eventsQueue.push(retryEvent)
              }
            }

            // Since we can't execute the bundle, continue
            continue
          }
        } else if (bundleState.selectedExecutor !== wallet.address) {
          this.logger.info(
            '[ChugSplash]: a different executor has already claimed the bundle'
          )
        }

        // If we make it to the point, we know that this executor is selected to claim the bundle.

        this.logger.info(`[ChugSplash]: checking that the project is funded...`)

        if (
          await hasSufficientFundsForExecution(
            provider,
            bundle,
            bundleState.actionsExecuted.toNumber(),
            projectName
          )
        ) {
          this.logger.info(`[ChugSplash]: ${projectName} has sufficient funds`)
          // execute bundle
          try {
            await executeTask({
              chugSplashManager: manager,
              bundleState,
              bundle,
              executor: wallet,
              projectName,
              logger: this.logger,
            })
          } catch (e) {
            // log error
            this.logger.error(
              '[ChugSplash]: error: execution error',
              e,
              canonicalConfig.options
            )

            // create retry event and add to the queue
            const event = this.state.eventsQueue.pop()
            const retryEvent = generateRetryEvent(event)
            if (retryEvent !== undefined) {
              this.state.eventsQueue.push(retryEvent)
            }
            continue
          }

          // Update status in the ChugSplash managed database
          if (this.state.graphQLClient) {
            try {
              await updateDeployment(
                this.state.graphQLClient,
                activeBundleId,
                'executed',
                []
              )
            } catch (error) {
              this.logger.error(
                '[ChugSplash]: error: deployment update error',
                error
              )
            }
          }

          // verify on etherscan
          try {
            if (
              isSupportedNetworkOnEtherscan(
                remoteExecution && (await getChainId(this.state.provider))
              )
            ) {
              this.logger.info(
                `[ChugSplash]: attempting to verify source code on etherscan for project: ${projectName}`
              )
              await verifyChugSplashConfig(
                proposalEvent.args.configUri,
                provider,
                this.options.network,
                activeBundleId
              )
              this.logger.info(
                `[ChugSplash]: finished attempting etherscan verification for project: ${projectName}`
              )
            } else {
              this.logger.info(
                `[ChugSplash]: skipped verifying project: ${projectName}. reason: etherscan config not detected for network: ${this.options.network}`
              )
            }
          } catch (e) {
            this.logger.error(
              '[ChugSplash]: error: verification error',
              e,
              canonicalConfig.options
            )
          }

          // Update status in the ChugSplash managed database
          if (this.state.graphQLClient) {
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
                this.state.graphQLClient,
                activeBundleId,
                'verified',
                contracts
              )
            } catch (error) {
              this.logger.error(
                '[ChugSplash]: error: deployment update error',
                error
              )
            }
          }

          trackExecuted(
            await getProjectOwnerAddress(this.state.wallet, projectName),
            projectName,
            this.options.network,
            integration
          )
        } else {
          this.logger.info(
            `[ChugSplash]: ${projectName} has insufficient funds`
          )

          // Continue to the next bundle if there is an insufficient amount of funds in the
          // ChugSplashManager. We will make attempts to execute the bundle on
          // subsequent iterations of the BaseService for up to 30 minutes.
          const event = this.state.eventsQueue.pop()
          const retryEvent = generateRetryEvent(event, 100, 30000)
          if (retryEvent !== undefined) {
            this.state.eventsQueue.push(retryEvent)
          }
          continue
        }

        this.logger.info(`[ChugSplash]: claiming executor's payment...`)

        // Withdraw any debt owed to the executor. Note that even if a bundle is cancelled by the
        // project owner during execution, the executor will still be able to claim funds here.
        await claimExecutorPayment(wallet, manager)

        this.logger.info(`[ChugSplash]: claimed executor's payment`)

        // If we make it to this point, we know that the executor has executed the bundle (or that it
        // has been cancelled by the owner), and that the executor has claimed its payment.
      }

      // Remove the current event from the events queue.
      this.state.eventsQueue.pop()
    }
  }
}

if (require.main === module) {
  const service = new ChugSplashExecutor()
  service.run()
}
