import { BaseServiceV2, validators } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import {
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
} from '@chugsplash/contracts'

import {
  parseStrategyString,
  ExecutorSelectionStrategy,
  compileRemoteBundle,
} from './utils'

type Options = {
  registry: string
  rpc: ethers.providers.StaticJsonRpcProvider
  key: string
  ess: string
  eps: string
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
        registry: {
          desc: 'address of the ChugSplashRegistry contract',
          validator: validators.str,
        },
        rpc: {
          desc: 'rpc for the chain to run the executor on',
          validator: validators.staticJsonRpcProvider,
        },
        key: {
          desc: 'private key to use for signing transactions',
          validator: validators.str,
        },
        ess: {
          desc: 'comma separated list of ESS contracts to accept',
          validator: validators.str,
        },
        eps: {
          desc: 'comma separated list of EPS contracts to accept',
          validator: validators.str,
        },
      },
      metricsSpec: {},
    })
  }

  async init() {
    this.state.registry = new ethers.Contract(
      this.options.registry,
      ChugSplashRegistryABI,
      this.options.rpc
    )
    this.state.wallet = new ethers.Wallet(this.options.key, this.options.rpc)
    this.state.ess = parseStrategyString(this.options.ess)
    this.state.eps = parseStrategyString(this.options.eps)
  }

  async main() {
    // TODO: Recover if we crashed and are in the middle of executing an upgrade

    // Find all active upgrades that have not yet been started
    const approvalAnnouncementEvents = await this.state.registry.queryFilter(
      this.state.registry.filters.EventAnnounced('ChugSplashBundleApproved')
    )

    // TODO: Cache events that we've already seen so we don't do a bunch of work on the same events
    //       more than once.
    // TODO: When we spin up, should we look for previous events, or should we only look at new
    //       events? If we look at previous events, we need to figure out how to quickly filter out
    //       upgrades that have already been completed.

    for (const approvalAnnouncementEvent of approvalAnnouncementEvents) {
      const manager = new ethers.Contract(
        approvalAnnouncementEvent.args.manager,
        ChugSplashManagerABI,
        this.state.wallet
      )

      // TODO: Add this to the ChugSplashManager contract
      const ess = await manager.getExecutorSelectionStrategy()
      if (!this.state.ess.includes(ess)) {
        // We don't like this strategy, skip the upgrade.
        continue
      }

      // TODO: Add this to the ChugSplashManager contract
      const eps = await manager.getExecutorPaymentStrategy()
      if (!this.state.eps.includes(eps)) {
        // We don't like this strategy, skip the upgrade.
        continue
      }

      const receipt = await approvalAnnouncementEvent.getTransactionReceipt()
      const approvalEvent = manager.parseLog(
        receipt.logs.find((log) => {
          return log.logIndex === approvalAnnouncementEvent.logIndex - 1
        })
      )

      const activeBundleId = await manager.activeBundleId()
      if (activeBundleId !== approvalEvent.args.bundleId) {
        // This is not the active bundle, so we can skip it.
        continue
      }

      // TODO: Add this to the ChugSplashManager contract
      const selectedExecutor = await manager.getSelectedExecutor(activeBundleId)
      if (selectedExecutor !== ethers.constants.AddressZero) {
        // Someone else has been selected to execute the upgrade, so we can skip it.
        continue
      }

      const proposalEvents = await manager.queryFilter(
        manager.filters.EventProposed(activeBundleId)
      )
      if (proposalEvents.length !== 1) {
        // TODO: throw an error here or skip
      }

      const proposalEvent = proposalEvents[0]
      const bundle = await compileRemoteBundle(proposalEvent.args.configUri)
      if (bundle.root !== proposalEvent.args.bundleRoot) {
        // TODO: throw an error here or skip
      }

      // TODO: Perform a quick upper-bound estimation of the amount of gas required to execute this
      //       upgrade. We can do this without simulating anything because ChugSplash upgrades are
      //       fully deterministic. If account's balance is above the upper-bound estimation, then
      //       we're ok with claiming the upgrade.

      // Try to become the selected executor.
      // TODO: Use an adapter system to make this easier.
      if (ess === ExecutorSelectionStrategy.SIMPLE_LOCK) {
        try {
          const strategy = new ethers.Contract(
            ess,
            // TODO: Use the right ABI here
            ChugSplashManagerABI,
            this.state.wallet
          )

          const tx = await strategy.claim(activeBundleId)
          await tx.wait()
        } catch (err) {
          // Unable to claim the lock, so skip this upgrade.
          continue
        }
      } else {
        throw new Error(`unsupported strategy: ${ess}`)
      }

      // TODO: Handle cancellation cleanly
      for (const action of bundle.actions) {
        // TODO: Handle errors cleanly
        const tx = await manager.executeChugSplashBundleAction(
          action.action,
          action.proof.actionIndex,
          action.proof.siblings
        )
        await tx.wait()
      }

      const completedEvents = await manager.queryFilter(
        manager.filters.ChugSplashBundleCompleted(activeBundleId)
      )
      if (completedEvents.length !== 1) {
        // TODO: throw an error here
      }

      // TODO: Check that we got paid appropriately.
      // TODO: Get our bond back.
    }
  }
}
