import { BaseServiceV2 } from '@eth-optimism/common-ts/dist/base-service/base-service-v2'
import { LogLevel } from '@eth-optimism/common-ts/dist/common/logger'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core'
import { Contract } from 'ethers'

export type ExecutorKey = {
  id: number
  privateKey: string
  locked: boolean
}

export type ExecutorOptions = {
  url: string
  network: string
  privateKeys: string
  logLevel: LogLevel
  managedApiUrl: string
}
export type ExecutorMetrics = {}

export type ExecutorEvent = {
  retry: number
  waitingPeriodMs: number
  nextTry: Date
  eventInfo: {
    managerAddress: string
    transactionHash: string
  }
}

export type ExecutorState = {
  eventsQueue: ExecutorEvent[]
  executionCache: ExecutorEvent[]
  registry: Contract
  provider: SphinxJsonRpcProvider
  lastBlockNumber: number
  keys: ExecutorKey[]
}

export declare class SphinxExecutorType extends BaseServiceV2<
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState
> {
  constructor(options?: Partial<ExecutorOptions>)
  setup(
    options: Partial<ExecutorOptions>,
    provider?: SphinxJsonRpcProvider
  ): Promise<void>
  init(): Promise<void>
  main(): Promise<void>
}
