import * as dotenv from 'dotenv'
dotenv.config()
import {
  BaseServiceV2,
  Logger,
  LogLevel,
  validators,
} from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import {
  ChugSplashManagerABI,
  ChugSplashRegistryABI,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
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
} from '@chugsplash/core'
import * as Amplitude from '@amplitude/node'

import {
  compileRemoteBundle,
  verifyChugSplash,
  verifyChugSplashConfig,
  isSupportedNetworkOnEtherscan,
  bundleRemoteSubtask,
} from './utils'

export * from './utils'

type Options = {
  url: string
  network: string
  privateKey: string
  amplitudeKey: string
  logLevel: LogLevel
}

type Metrics = {}

type State = {
  eventsQueue: ethers.Event[]
  registry: ethers.Contract
  provider: ethers.providers.JsonRpcProvider
  lastBlockNumber: number
  amplitudeClient: Amplitude.NodeClient
  wallet: ethers.Wallet
}

export class ChugSplashExecutor extends BaseServiceV2<Options, Metrics, State> {
  constructor(options?: Partial<Options>) {
    super({
      name: 'chugsplash-executor',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version: require('../package.json').version,
      loop: true,
      loopIntervalMs: 5000,
      options,
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
        amplitudeKey: {
          desc: 'Amplitude API key for analytics',
          validator: validators.str,
          default: 'disabled',
        },
        logLevel: {
          desc: 'Executor log level',
          validator: validators.str,
          default: 'error',
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
    options: Partial<Options>,
    provider?: ethers.providers.JsonRpcProvider
  ) {
    this.logger = new Logger({
      name: 'Logger',
      level: options.logLevel,
    })

    if (options.amplitudeKey !== 'disabled') {
      this.state.amplitudeClient = Amplitude.init(this.options.amplitudeKey)
    }

    const reg = CHUGSPLASH_REGISTRY_PROXY_ADDRESS
    this.state.provider =
      provider ?? new ethers.providers.JsonRpcProvider(options.url)
    this.state.registry = new ethers.Contract(
      reg,
      ChugSplashRegistryABI,
      this.state.provider
    )
    this.state.lastBlockNumber = -1

    // This represents a queue of "BundleApproved" events to execute.
    this.state.eventsQueue = []

    this.state.wallet = new ethers.Wallet(
      options.privateKey,
      this.state.provider
    )

    this.logger.info('[ChugSplash]: setting up chugsplash...')

    // Deploy the ChugSplash contracts.
    await initializeChugSplash(
      this.state.provider,
      this.state.wallet,
      this.logger
    )

    this.logger.info('[ChugSplash]: finished setting up chugsplash')

    // Verify the ChugSplash contracts if the current network is supported.
    if (isSupportedNetworkOnEtherscan(this.options.network)) {
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
  }

  async init() {
    await this.setup(this.options)
  }

  async main(localBundleId?: string, canonicalConfigFolderPath?: string) {
    const { provider, wallet, registry } = this.state

    const latestBlockNumber = await provider.getBlockNumber()

    // Get approval events in blocks after the stored block number
    const newApprovalEvents = await registry.queryFilter(
      registry.filters.EventAnnounced('ChugSplashBundleApproved'),
      this.state.lastBlockNumber,
      latestBlockNumber
    )

    // Concatenate the new approval events to the array
    this.state.eventsQueue = this.state.eventsQueue.concat(newApprovalEvents)

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
    for (const approvalAnnouncementEvent of eventsCopy) {
      this.logger.info('[ChugSplash]: detected a project...')

      // Remove the current event from the front of the events queue and place it at the end of the
      // array. This ensures that the current event won't block the execution of other events if
      // we're unable to execute it.
      this.state.eventsQueue.shift()
      this.state.eventsQueue.push(approvalAnnouncementEvent)

      // fetch manager for relevant project
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
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
        if (localBundleId !== undefined) {
          canonicalConfig = readCanonicalConfig(
            canonicalConfigFolderPath,
            localBundleId
          )
          bundle = await bundleRemoteSubtask({ canonicalConfig })
        } else {
          ;({ bundle, canonicalConfig } = await compileRemoteBundle(
            proposalEvent.args.configUri
          ))
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
          `[ChugSplash]: compiled ${projectName} on: ${this.options.network}. checking that the project is funded...`
        )

        const bundleState: ChugSplashBundleState = await manager.bundles(
          activeBundleId
        )

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
            // log error and continue
            this.logger.error(
              '[ChugSplash]: error: execution error',
              e,
              canonicalConfig.options
            )
            continue
          }

          // verify on etherscan
          try {
            if (isSupportedNetworkOnEtherscan(this.options.network)) {
              this.logger.info(
                `[ChugSplash]: attempting to verify source code on etherscan for project: ${projectName}`
              )
              await verifyChugSplashConfig(
                proposalEvent.args.configUri,
                provider,
                this.options.network
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

          if (this.options.amplitudeKey !== 'disabled') {
            this.state.amplitudeClient.logEvent({
              event_type: 'chugsplash executed',
              user_id: await getProjectOwnerAddress(provider, projectName),
              event_properties: {
                projectName,
              },
            })
          }
        } else {
          this.logger.info(
            `[ChugSplash]: ${projectName} has insufficient funds`
          )
          // Continue to the next bundle if there is an insufficient amount of funds in the
          // ChugSplashManager. We will continue to make attempts to execute the bundle on
          // subsequent iterations of the BaseService.
          continue
        }
      }

      this.logger.info(`[ChugSplash]: claiming executor's payment...`)

      // Withdraw any debt owed to the executor. Note that even if a bundle is cancelled by the
      // project owner during execution, the executor will still be able to claim funds here.
      await claimExecutorPayment(wallet, manager)

      this.logger.info(`[ChugSplash]: claimed executor's payment`)

      // If we make it to this point, we know that the executor has executed the bundle (or that it
      // has been cancelled by the owner), and that the executor has claimed its payment.

      // Remove the current event from the events queue.
      this.state.eventsQueue.pop()
    }
  }
}

if (require.main === module) {
  const service = new ChugSplashExecutor()
  service.run()
}
