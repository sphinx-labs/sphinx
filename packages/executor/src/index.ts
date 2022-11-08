import hre from 'hardhat'
import { BaseServiceV2, validators } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import {
  ChugSplashManagerABI,
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
  rpc: string
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
        rpc: {
          desc: 'rpc for the chain to run the executor on',
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
    const provider = ethers.getDefaultProvider(this.options.rpc)
    this.state.registry = new ethers.Contract(
      reg,
      ChugSplashManagerABI,
      provider
    )
    // this.state.wallet = new ethers.Wallet(this.options.key, provider)
    const runtime = hre as any
    this.state.wallet = runtime.ethers.provider.getSigner()
  }

  async main() {
    // Find all active upgrades that have not yet been started
    const approvalAnnouncementEvents = await this.state.registry.queryFilter(
      this.state.registry.filters.ChugSplashBundleApproved()
    )

    console.log(approvalAnnouncementEvents)

    for (const approvalAnnouncementEvent of approvalAnnouncementEvents) {
      const signer = this.state.wallet
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
        ChugSplashManagerABI,
        signer
      )

      const activeBundleId = await manager.activeBundleId()

      const bundleState: ChugSplashBundleState = await manager.bundles(
        activeBundleId
      )

      // TODO: Add this to the ChugSplashManager contract
      const selectedExecutor = await manager.getSelectedExecutor(activeBundleId)
      if (selectedExecutor !== ethers.constants.AddressZero) {
        // Someone else has been selected to execute the upgrade, so we can skip it.
        continue
      }

      // claim bundle
      if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
        const tx = await manager.claimBundle({
          value: EXECUTOR_BOND_AMOUNT,
        })
        await tx.wait()
      }

      const proposalEvents = await manager.queryFilter(
        manager.filters.ChugSplashBundleProposed(activeBundleId)
      )

      if (proposalEvents.length !== 1) {
        // TODO: throw an error here or skip
      }

      const proposalEvent = proposalEvents[0]
      const bundle = await compileRemoteBundle(
        hre,
        proposalEvent.args.configUri
      )
      if (bundle.root !== proposalEvent.args.bundleRoot) {
        // TODO: throw an error here or skip
      }
    }
  }
}

const executor = new ChugSplashExecutor()
executor.run()
