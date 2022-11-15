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
import { ChugSplashBundleState } from '@chugsplash/core'
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
  registry: ethers.Contract
  wallet: ethers.Wallet
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
    const provider = ethers.getDefaultProvider(this.options.network)
    this.state.registry = new ethers.Contract(
      reg,
      ChugSplashRegistryABI,
      provider
    )
    this.state.lastBlockNumber = -1
    this.state.wallet = new ethers.Wallet(this.options.privateKey, provider)
  }

  async main() {
    // Find all active upgrades that have not yet been executed in blocks after the stored hash
    const approvalAnnouncementEvents = await this.state.registry.queryFilter(
      this.state.registry.filters.EventAnnounced('ChugSplashBundleApproved'),
      this.state.lastBlockNumber + 1
    )

    // If none found, return
    if (approvalAnnouncementEvents.length === 0) {
      this.logger.info('no events found')
      return
    }

    this.logger.info(`${approvalAnnouncementEvents.length} events found`)

    // store last block number
    this.state.lastBlockNumber = approvalAnnouncementEvents.at(-1).blockNumber

    // execute all approved bundles
    for (const approvalAnnouncementEvent of approvalAnnouncementEvents) {
      // fetch manager for relevant project
      const signer = this.state.wallet
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
        ChugSplashManagerABI,
        signer
      )

      // get active bundle id for this project
      const activeBundleId = await manager.activeBundleId()
      if (activeBundleId === ethers.constants.HashZero) {
        this.logger.error(`Error: No active bundle id found in manager`)
        continue
      }

      // fetch bundle state
      const bundleState: ChugSplashBundleState = await manager.bundles(
        activeBundleId
      )

      // get proposal event and compile
      const proposalEvents = await manager.queryFilter(
        manager.filters.ChugSplashBundleProposed(activeBundleId)
      )
      const proposalEvent = proposalEvents[0]
      const { bundle, canonicalConfig } = await compileRemoteBundle(
        hre,
        proposalEvent.args.configUri
      )

      // ensure compiled bundle matches proposed bundle
      if (bundle.root !== proposalEvent.args.bundleRoot) {
        // log error and continue
        this.logger.error(
          'Error: Compiled bundle root does not match proposal event bundle root',
          canonicalConfig.options
        )
        continue
      }

      // execute bundle
      try {
        await hre.run('chugsplash-execute', {
          chugSplashManager: manager,
          bundleState,
          bundle,
          parsedConfig: canonicalConfig,
          deployer: signer,
          hide: false,
        })
        this.logger.info('Successfully executed')
      } catch (e) {
        // log error and continue
        this.logger.error('Error: execution error', e, canonicalConfig.options)
        continue
      }

      // verify on etherscan
      try {
        if ((await getChainId(this.state.wallet.provider)) !== 31337) {
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
    }
  }
}

const executor = new ChugSplashExecutor()
executor.run()
