import { BaseServiceV2 } from '@eth-optimism/common-ts'

type Options = {}

type Metrics = {}

type State = {}

export class Executor extends BaseServiceV2<Options, Metrics, State> {
  constructor(options?: Partial<Options>) {
    super({
      name: 'chugsplash-executor',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version: require('../package.json').version,
      loop: true,
      loopIntervalMs: 5000,
      options,
      optionsSpec: {},
      metricsSpec: {},
    })
  }

  async init() {}

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
