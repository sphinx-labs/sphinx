import hre from 'hardhat'
import { BaseServiceV2, validators } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import {
  ChugSplashManagerABI,
  ChugSplashRegistryABI,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  EXECUTOR_BOND_AMOUNT,
} from '@chugsplash/contracts'
import { ChugSplashBundleState } from '@chugsplash/core'

import {
  // parseStrategyString,
  compileRemoteBundle,
} from './utils'

type Options = {
  // registry: string
  network: string
  // key: string
}

type Metrics = {}

type State = {
  registry: ethers.Contract
  wallet: ethers.Wallet
  ess: string[]
  eps: string[]
}

export class ChugSplashExecutor extends BaseServiceV2<Options, Metrics, State> {
  constructor(options?: Partial<Options>) {
    super({
      name: 'executor',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version: require('../package.json').version,
      loop: true,
      loopIntervalMs: 1000,
      options,
      optionsSpec: {
        // TODO - figure out what to pass in here to make it work locally
        // Currently it just fetches the address with CHUGSPLASH_REGISTRY_PROXY_ADDRESS
        // registry: {
        //   desc: 'address of the ChugSplashRegistry contract',
        //   validator: validators.str,
        // },
        network: {
          desc: 'network for the chain to run the executor on',
          validator: validators.str,
          default: 'http://localhost:8545',
        },
        // key: {
        //   desc: 'private key to use for signing transactions',
        //   validator: validators.str,
        // },
      },
      metricsSpec: {},
    })
  }

  async init() {
    const reg = CHUGSPLASH_REGISTRY_PROXY_ADDRESS
    console.log(reg)
    const provider = ethers.getDefaultProvider(this.options.network)
    this.state.registry = new ethers.Contract(
      reg,
      ChugSplashRegistryABI,
      provider
    )

    this.state.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  }

  async main() {
    // Find all active upgrades that have not yet been started
    const approvalAnnouncementEvents = await this.state.registry.queryFilter(
      this.state.registry.filters.EventAnnounced('ChugSplashBundleApproved')
    )

    for (const approvalAnnouncementEvent of approvalAnnouncementEvents) {
      const signer = this.state.wallet
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
        ChugSplashManagerABI,
        signer
      )

      const activeBundleId = await manager.activeBundleId()
      if (
        activeBundleId ===
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      ) {
        console.log('no active bundle')
        continue
      }
      console.log(activeBundleId)

      const bundleState: ChugSplashBundleState = await manager.bundles(
        activeBundleId
      )

      console.log(bundleState)

      // TODO: Add this to the ChugSplashManager contract
      const selectedExecutor = await manager.getSelectedExecutor(activeBundleId)
      console.log(selectedExecutor)
      if (selectedExecutor !== ethers.constants.AddressZero) {
        // Someone else has been selected to execute the upgrade, so we can skip it.
        continue
      }

      console.log('claiming')

      // claim bundle
      if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
        const tx = await manager.claimBundle({
          value: EXECUTOR_BOND_AMOUNT,
        })
        await tx.wait()
      }

      console.log('getting proposal events')

      const proposalEvents = await manager.queryFilter(
        manager.filters.ChugSplashBundleProposed(activeBundleId)
      )

      console.log(proposalEvents)
      if (proposalEvents.length !== 1) {
        // TODO: throw an error here or skip
      }

      console.log('getting bundle')
      const proposalEvent = proposalEvents[0]
      const { bundle, canonicalConfig } = await compileRemoteBundle(
        hre,
        proposalEvent.args.configUri
      )
      if (bundle.root !== proposalEvent.args.bundleRoot) {
        // TODO: throw an error here or skip
      }

      console.log(bundle)

      console.log('executing')
      // todo call chugsplash-execute if deploying locally
      await hre.run('chugsplash-execute', {
        chugSplashManager: manager,
        bundleState,
        bundle,
        deployerAddress: signer.getAddress(),
        parsedConfig: canonicalConfig,
        deployer: signer,
        hide: true,
      })
    }
  }
}

const executor = new ChugSplashExecutor()
executor.run()
