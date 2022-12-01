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
  deployChugSplashPredeploys,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import * as Amplitude from '@amplitude/node'

import {
  compileRemoteBundle,
  verifyChugSplashPredeploys,
  verifyChugSplashConfig,
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

// TODO: Add logging agent for docker container and connect to a managed sink such as logz.io
// Refactor chugsplash commands to decide whether to use the executor based on the target network

export class ChugSplashExecutor extends BaseServiceV2<Options, Metrics, State> {
  constructor(options?: Partial<Options>) {
    super({
      name: 'chugsplash-executor',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version: require('../package.json').version,
      loop: true,
      loopIntervalMs: 1000,
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
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
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

    // Deploy the ChugSplash predeploys.
    await deployChugSplashPredeploys(this.state.provider, this.state.wallet)

    // Verify the ChugSplash predeploys if the current network is live.
    if ((await getChainId(this.state.provider)) !== 31337) {
      await verifyChugSplashPredeploys(
        this.state.provider,
        this.options.network
      )
    }

    this.logger = new Logger({
      name: 'Logger',
      level: options.logLevel,
    })
  }

  async init() {
    await this.setup(this.options)
  }

  async main(
    options?: Partial<Options>,
    provider?: ethers.providers.JsonRpcProvider,
    localCanonicalConfig?: CanonicalChugSplashConfig
  ) {
    // Setup state if options were provided.
    // Necessary to allow the user to pass in options when running the executor programmatically.
    if (options) {
      await this.setup(options, provider)
    }

    const latestBlockNumber = await this.state.provider.getBlockNumber()

    // Get approval events in blocks after the stored block number
    const newApprovalEvents = await this.state.registry.queryFilter(
      this.state.registry.filters.EventAnnounced('ChugSplashBundleApproved'),
      this.state.lastBlockNumber + 1,
      latestBlockNumber
    )

    // Concatenate the new approval events to the array
    this.state.eventsQueue = this.state.eventsQueue.concat(newApprovalEvents)

    // store last block number
    this.state.lastBlockNumber = latestBlockNumber

    // If none found, return
    if (this.state.eventsQueue.length === 0) {
      this.logger.info('no events found')
      return
    }

    this.logger.info(
      `total number of events: ${this.state.eventsQueue.length}. new events: ${newApprovalEvents.length}`
    )

    // Create a copy of the events queue, which we will iterate over. It's necessary to create a
    // copy because we will be re-arranging the order of the elements in the `eventsQueue` during
    // execution, and we only want to attempt to execute each element once.
    const eventsCopy = this.state.eventsQueue.slice()

    // execute all approved bundles
    for (const approvalAnnouncementEvent of eventsCopy) {
      // Remove the current event from the front of the events queue and place it at the end of the
      // array. This ensures that the current event won't block the execution of other events if
      // we're unable to execute it.
      this.state.eventsQueue.shift()
      this.state.eventsQueue.push(approvalAnnouncementEvent)

      // fetch manager for relevant project
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
        ChugSplashManagerABI,
        this.state.wallet
      )

      // get active bundle id for this project
      const activeBundleId = await manager.activeBundleId()
      if (activeBundleId !== ethers.constants.HashZero) {
        // Retrieve the corresponding proposal event to get the config URI.
        const [proposalEvent] = await manager.queryFilter(
          manager.filters.ChugSplashBundleProposed(activeBundleId)
        )

        // Compile the bundle using either the provided localCanonicalConfig (when running the executor from within the ChugSplash plugin),
        // or using the Config URI
        const { bundle, canonicalConfig } = await compileRemoteBundle(
          proposalEvent.args.configUri,
          localCanonicalConfig
        )

        // ensure compiled bundle matches proposed bundle
        if (bundle.root !== proposalEvent.args.bundleRoot) {
          // We cannot execute the current bundle, so we remove the corresponding event from the end
          // of the events queue.
          this.state.eventsQueue.pop()

          // log error and continue
          this.logger.error(
            'Error: Compiled bundle root does not match proposal event bundle root',
            canonicalConfig.options
          )
          continue
        }

        if (
          await hasSufficientFundsForExecution(
            this.state.provider,
            canonicalConfig
          )
        ) {
          // execute bundle
          try {
            await executeTask({
              chugSplashManager: manager,
              bundleId: activeBundleId,
              bundle,
              executor: this.state.wallet,
            })
            this.logger.info('Successfully executed')
          } catch (e) {
            // log error and continue
            this.logger.error(
              'Error: execution error',
              e,
              canonicalConfig.options
            )
            continue
          }

          // verify on etherscan
          try {
            if ((await getChainId(this.state.provider)) !== 31337) {
              await verifyChugSplashConfig(
                proposalEvent.args.configUri,
                this.state.provider,
                this.options.network
              )
              this.logger.info('Successfully verified')
            }
          } catch (e) {
            this.logger.error(
              'Error: verification error',
              e,
              canonicalConfig.options
            )
          }

          if (this.options.amplitudeKey !== 'disabled') {
            this.state.amplitudeClient.logEvent({
              event_type: 'ChugSplash Executed',
              user_id: canonicalConfig.options.projectOwner,
              event_properties: {
                projectName: canonicalConfig.options.projectName,
              },
            })
          }
        } else {
          // Continue to the next bundle if there is an insufficient amount of funds in the
          // ChugSplashManager. We will continue to make attempts to execute the bundle on
          // subsequent iterations of the BaseService.
          continue
        }
      }

      // Withdraw any debt owed to the executor. Note that even if a bundle is cancelled by the
      // project owner during execution, the executor will still be able to claim funds here.
      await claimExecutorPayment(this.state.wallet, manager)

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
