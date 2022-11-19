import * as dotenv from 'dotenv'
dotenv.config()
import hre from 'hardhat'
import { BaseServiceV2, validators } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import {
  ChugSplashManagerABI,
  ChugSplashRegistryABI,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
} from '@chugsplash/contracts'
import {
  claimExecutorPayment,
  hasSufficientFundsForExecution,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import * as Amplitude from '@amplitude/node'

import { compileRemoteBundle, verifyChugSplashConfig } from './utils'

type Options = {
  network: string
  privateKey: string
  amplitudeKey: string
}

type Metrics = {}

type State = {
  events: ethers.Event[]
  registry: ethers.Contract
  provider: ethers.providers.JsonRpcProvider
  lastBlockNumber: number
  amplitudeClient: Amplitude.NodeClient
}

// TODO:
// Add logging agent for docker container and connect to a managed sink such as logz.io
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
        network: {
          desc: 'network for the chain to run the executor on',
          validator: validators.str,
        },
        privateKey: {
          desc: 'private key used for deployments',
          validator: validators.str,
        },
        amplitudeKey: {
          desc: 'API key to send data to Amplitude',
          validator: validators.str,
          default: 'disabled',
        },
      },
      metricsSpec: {},
    })
  }

  async init() {
    if (this.options.amplitudeKey !== 'disabled') {
      this.state.amplitudeClient = Amplitude.init(this.options.amplitudeKey)
    }

    const reg = CHUGSPLASH_REGISTRY_PROXY_ADDRESS
    this.state.provider = new ethers.providers.JsonRpcProvider(
      this.options.network
    )
    this.state.registry = new ethers.Contract(
      reg,
      ChugSplashRegistryABI,
      this.state.provider
    )
    this.state.lastBlockNumber = -1
    this.state.events = []
  }

  async main() {
    const wallet = new ethers.Wallet(
      this.options.privateKey,
      this.state.provider
    )

    const latestBlockNumber = await this.state.provider.getBlockNumber()

    // Get approval events in blocks after the stored block number
    const newApprovalEvents = await this.state.registry.queryFilter(
      this.state.registry.filters.EventAnnounced('ChugSplashBundleApproved'),
      this.state.lastBlockNumber + 1,
      latestBlockNumber
    )

    // Concatenate the new approval events to the array
    this.state.events = this.state.events.concat(newApprovalEvents)

    // store last block number
    this.state.lastBlockNumber = latestBlockNumber

    // If none found, return
    if (this.state.events.length === 0) {
      this.logger.info('no events found')
      return
    }

    this.logger.info(
      `total number of events: ${this.state.events.length}. new events: ${newApprovalEvents.length}`
    )

    const eventsCopy = this.state.events.slice()

    // execute all approved bundles
    for (const approvalAnnouncementEvent of eventsCopy) {
      // Remove the current event from the front of the events array and put it at the end
      this.state.events.shift()
      this.state.events.push(approvalAnnouncementEvent)

      // fetch manager for relevant project
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
        ChugSplashManagerABI,
        wallet
      )

      // get active bundle id for this project
      const activeBundleId = await manager.activeBundleId()
      if (activeBundleId !== ethers.constants.HashZero) {
        // Retrieve the corresponding proposal event to get the config URI.
        const [proposalEvent] = await manager.queryFilter(
          manager.filters.ChugSplashBundleProposed(activeBundleId)
        )

        // Compile the bundle using the config URI.
        const { bundle, canonicalConfig } = await compileRemoteBundle(
          hre,
          proposalEvent.args.configUri
        )

        // ensure compiled bundle matches proposed bundle
        if (bundle.root !== proposalEvent.args.bundleRoot) {
          // We cannot execute this bundle, so we remove it from the events array.
          this.state.events.pop()

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
            await hre.run('chugsplash-execute', {
              chugSplashManager: manager,
              bundleId: activeBundleId,
              bundle,
              parsedConfig: canonicalConfig,
              executor: wallet,
              hide: false,
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
              await verifyChugSplashConfig(hre, proposalEvent.args.configUri)
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
          // ChugSplashManager.
          continue
        }
      }

      // Withdraw any debt owed to the executor.
      await claimExecutorPayment(wallet, manager)

      // Remove the current event from the events array.
      this.state.events.pop()
    }
  }
}

const executor = new ChugSplashExecutor()
executor.run()
