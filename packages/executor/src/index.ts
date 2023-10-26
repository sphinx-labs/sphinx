import { fork } from 'child_process'

import * as dotenv from 'dotenv'
dotenv.config({ path: `.env.${process.env.NODE_ENV}` })
import {
  BaseServiceV2,
  Logger,
  StandardOptions,
  validators,
} from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import { SphinxRegistryABI } from '@sphinx-labs/contracts'
import {
  getSphinxRegistryAddress,
  ensureSphinxInitialized,
  isEventLog,
  SphinxJsonRpcProvider,
} from '@sphinx-labs/core'
import { GraphQLClient } from 'graphql-request'

import {
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState,
  ExecutorEvent,
  ExecutorKey,
} from './types'
import { ExecutorMessage, ResponseMessage } from './utils/execute'
export * from './utils'

const defaultURL = 'http://127.0.0.1:42420'
export class SphinxExecutor extends BaseServiceV2<
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState & {
    graphQLClient: GraphQLClient
  }
> {
  constructor(options?: Partial<ExecutorOptions & StandardOptions>) {
    super({
      name: 'sphinx-executor',
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
          default: defaultURL,
        },
        network: {
          desc: 'Target deployment network name',
          validator: validators.str,
          default: '127.0.0.1',
        },
        privateKeys: {
          desc: 'Command delimited list of private keys for signing deployment transactions',
          validator: validators.str,
          default:
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        },
        logLevel: {
          desc: 'Executor log level',
          validator: validators.str,
          default: 'error',
        },
        managedApiUrl: {
          desc: 'Sphinx Managed GraphQL API',
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
    provider?: SphinxJsonRpcProvider
  ) {
    this.logger = new Logger({
      name: 'Logger',
      level: options.logLevel,
    })

    if (options.url === defaultURL && process.env.CHAIN_ID) {
      options.url = `http://127.0.0.1:${
        42000 + (parseInt(process.env.CHAIN_ID, 10) % 1000)
      }`
    }

    this.state.provider = provider ?? new SphinxJsonRpcProvider(options.url)
    this.state.registry = new ethers.Contract(
      getSphinxRegistryAddress(),
      SphinxRegistryABI,
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

    // This represents a queue of "DeploymentApproved" events to execute.
    this.state.eventsQueue = []
    // This represents a cache of "DeploymentApproved" events which are currently being executed.
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

    this.logger.info(`[Sphinx ${this.options.network}]: setting up sphinx...`)

    const wallet = new ethers.Wallet(
      this.state.keys[0].privateKey,
      this.state.provider
    )

    const executorAddresses: string[] = []
    for (const key of this.state.keys) {
      const w = new ethers.Wallet(key.privateKey, this.state.provider)
      executorAddresses.push(w.address)
    }

    const executors = this.state.keys.map(
      (el) => new ethers.Wallet(el.privateKey).address
    )

    const relayers = process.env.TESTING_RELAYERS
      ? process.env.TESTING_RELAYERS.split(',')
      : []
    const funders = process.env.TESTING_FUNDERS
      ? process.env.TESTING_FUNDERS.split(',')
      : []

    // Deploy the Sphinx contracts.
    await ensureSphinxInitialized(
      this.state.provider,
      wallet,
      executors,
      relayers,
      funders,
      this.logger
    )

    this.logger.info(
      `[Sphinx ${this.options.network}]: finished setting up sphinx`
    )
  }

  async main() {
    const { provider, registry } = this.state

    const latestBlockNumber = await provider.getBlockNumber()

    // Handles an edge case with retries that can only occur
    // when running the executor against a local network that
    // does not use interval mining (i.e the default hardhat network)
    if (this.state.lastBlockNumber > latestBlockNumber) {
      return
    }

    // Handle edge case where bnb testnet cannot query for events pass 10000 blocks back
    const chainId = (await provider.getNetwork()).chainId
    if (
      Number(chainId) === 97 &&
      this.state.lastBlockNumber === 0 &&
      latestBlockNumber > 9000
    ) {
      this.state.lastBlockNumber = latestBlockNumber - 9000
    }

    // Get approval events in blocks after the stored block number
    const newApprovalEvents = await registry.queryFilter(
      registry.filters.EventAnnouncedWithData('SphinxDeploymentApproved'),
      this.state.lastBlockNumber,
      latestBlockNumber
    )

    const currentTime = new Date()

    const newExecutorEvents: ExecutorEvent[] = newApprovalEvents
      .filter(isEventLog)
      .map((event) => {
        return {
          retry: 1,
          nextTry: currentTime,
          waitingPeriodMs: 15000,
          eventInfo: {
            managerAddress: event.args[1],
            transactionHash: event.transactionHash,
          },
        }
      })
      // Filter out events that are already in the queue (happens due to some node providers doing inclusive filtering on block numbers)
      .filter((e) => {
        for (const event of this.state.eventsQueue) {
          if (event.eventInfo.transactionHash === e.eventInfo.transactionHash) {
            return false
          }
        }

        return true
      })

    // Concatenate the new approval events to the array
    this.state.eventsQueue = this.state.eventsQueue.concat(newExecutorEvents)

    // store last block number
    this.state.lastBlockNumber = latestBlockNumber

    // If none found, return
    if (this.state.eventsQueue.length === 0) {
      this.logger.info(`[Sphinx ${this.options.network}]: no projects found`)
      return
    }

    this.logger.info(
      `[Sphinx ${this.options.network}]: total number of events: ${this.state.eventsQueue.length}. new events: ${newApprovalEvents.length}`
    )

    // Create a copy of the events queue, which we will iterate over. It's necessary to create a
    // copy because we will be re-arranging the order of the elements in the `eventsQueue` during
    // execution, and we only want to attempt to execute each element once.
    const eventsCopy = this.state.eventsQueue.slice()

    // execute all approved deployments
    for (const executorEvent of eventsCopy) {
      this.logger.info(
        `[Sphinx ${this.options.network}]: detected a project...`
      )

      // If still waiting on retry, then continue
      if (executorEvent.nextTry > currentTime) {
        continue
      }

      // find available key, continue if none found
      const key: ExecutorKey | undefined = this.state.keys.find(
        (el) => el.locked === false
      )
      if (key === undefined) {
        this.logger.info(`[Sphinx ${this.options.network}]: All keys in use`)
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
        provider: this.options.url,
        loggerOptions: this.logger.options,
        network: this.options.network,
        managedApiUrl: this.options.managedApiUrl,
        managedPublicKey: process.env.MANAGED_PUBLIC_KEY,
      }

      // Fork a child process and pass in the event and other required args
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
            e.eventInfo.transactionHash !==
            message.payload.eventInfo.transactionHash
        )

        // unlock the selected key
        this.state.keys[key.id].locked = false

        switch (message.action) {
          // on retry, put the new event back into the queue
          case 'retry':
            if (message.payload.retry === -1) {
              this.logger.info(
                `[Sphinx ${this.options.network}]: execution failed, discarding event due to reaching retry limit`
              )
            } else {
              this.state.eventsQueue.push(message.payload)
            }
            return
        }
      })
    }
  }
}

if (require.main === module) {
  const service = new SphinxExecutor()
  service.run()
}
