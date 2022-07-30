import { ethers } from 'ethers'
import { BaseServiceV2, validators } from '@eth-optimism/common-ts'
import { ChugSplashRegistryABI } from '@chugsplash/contracts'

type Options = {
  rpc: ethers.providers.StaticJsonRpcProvider
  chugSplashRegistryAddress: string
}

type Metrics = {}

type State = {
  registry: ethers.Contract
}

export class Executor extends BaseServiceV2<Options, Metrics, State> {
  constructor(options?: Partial<Options>) {
    super({
      name: 'chugsplash-executor',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version: require('../package.json').version,
      loop: true,
      loopIntervalMs: 5000,
      options,
      optionsSpec: {
        rpc: {
          validator: validators.staticJsonRpcProvider,
          desc: 'URL of the JSON RPC provider for the network we are connecting to',
        },
        chugSplashRegistryAddress: {
          validator: validators.str,
          desc: 'address of the ChugSplashRegistry contract',
        },
      },
      metricsSpec: {},
    })
  }

  async init() {
    this.state.registry = new ethers.Contract(
      this.options.chugSplashRegistryAddress,
      ChugSplashRegistryABI,
      this.options.rpc
    )
  }

  async main() {
    // 1. Find any available jobs
    // 2. Pick one of the available jobs
    // 3. Try to compile and check the job
    // 4. If the job is valid, run it, else cache bad and return
    // 5. Try to lock the job
    // 6. If the job was locked, run it, else return
    // 7. Start running the job
  }
}
