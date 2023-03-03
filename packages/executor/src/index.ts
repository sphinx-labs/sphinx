import { fork } from 'child_process'

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
  ChugSplashRecorderABI,
  CHUGSPLASH_RECORDER_ADDRESS,
} from '@chugsplash/contracts'
import {
  initializeChugSplash,
  Integration,
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState,
  ExecutorEvent,
  ExecutorKey,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { GraphQLClient } from 'graphql-request'

import { verifyChugSplash, isSupportedNetworkOnEtherscan } from './utils'
import {
  ExecutorMessage,
  handleExecution,
  ResponseMessage,
} from './utils/execute'
export * from './utils'

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
        privateKeys: {
          desc: 'Command delimited list of private keys for signing deployment transactions',
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
    // This represents a cache of "BundleApproved" events which are currently being executed.
    this.state.executionCache = []

    const keyStrings = options.privateKeys.split(',')
    this.state.keys = keyStrings.map((privateKey, index) => {
      return {
        id: index,
        privateKey,
        locked: false,
      }
    })
  }

  async init() {
    await this.setup(this.options)

    this.logger.info('[ChugSplash]: setting up chugsplash...')

    const wallet = new ethers.Wallet(
      this.state.keys[0].privateKey,
      this.state.provider
    )

    const executorAddresses: string[] = []
    for (const key of this.state.keys) {
      const w = new ethers.Wallet(key.privateKey, this.state.provider)
      executorAddresses.push(w.address)
    }

    // Deploy the ChugSplash contracts.
    await initializeChugSplash(
      this.state.provider,
      wallet,
      executorAddresses,
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
  }

  async main(
    canonicalConfigFolderPath?: string,
    integration?: Integration,
    remoteExecution: boolean = true
  ) {
    const { provider, recorder } = this.state

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

      // find available key, continue if none found
      const key: ExecutorKey | undefined = this.state.keys.find(
        (el) => el.locked === false
      )
      if (key === undefined) {
        this.logger.info('[ChugSplash]: All keys in use')
        continue
      } else {
        // lock the selected key
        this.state.keys[key.id].locked = true
      }

      // Remove the current event from the front of the queue and cache it
      // so we don't try to execute it in a subsequent iteration
      const event = this.state.eventsQueue.shift()
      this.state.executionCache.push(event)

      const executionMessage: ExecutorMessage = {
        executorEvent: event,
        key,
        provider: remoteExecution ? this.options.url : this.state.provider,
        loggerOptions: this.logger.options,
        remoteExecution,
        canonicalConfigFolderPath,
        network: this.options.network,
        managedApiUrl: this.options.managedApiUrl,
        managedPublicKey: process.env.MANAGED_PUBLIC_KEY,
        integration,
      }
      if (remoteExecution) {
        // If the event is being processed remotely then fork a child process and pass in the event and other required args
        const child = fork(`${__dirname}/utils/child.js`, {
          stdio: 'inherit',
        })
        child.send(executionMessage)

        // listen for events from child process
        child.on('message', (message: ResponseMessage) => {
          if (message.action === 'log') {
            this.logger[message.log.level](
              message.log.message,
              message.log.err,
              message.log.options
            )
            return
          }

          this.state.executionCache = this.state.executionCache.filter(
            (e) =>
              e.event.transactionHash !== message.payload.event.transactionHash
          )

          // unlock the selected key
          this.state.keys[key.id].locked = false

          switch (message.action) {
            // on retry, put the new event back into the queue
            case 'retry':
              if (message.payload.retry === -1) {
                this.logger.info(
                  '[ChugSplash]: execution failed, discarding event due to reaching retry limit'
                )
              } else {
                this.state.eventsQueue.push(message.payload)
              }
              return
          }
        })
      } else {
        // if executing locally then call the execution handler directly
        await handleExecution(executionMessage)
        // unlock the selected key
        this.state.keys[key.id].locked = false
      }
    }
  }
}

if (require.main === module) {
  const service = new ChugSplashExecutor()
  service.run()
}
