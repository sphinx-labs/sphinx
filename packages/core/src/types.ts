import { BaseServiceV2, LogLevel } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'

import { Integration } from './constants'

export type FoundryContractArtifact = {
  referenceName: string
  contractName: string
  contractAddress: string
}

export type ExecutorOptions = {
  url: string
  network: string
  privateKey: string
  logLevel: LogLevel
  managedApiUrl: string
}
export type ExecutorMetrics = {}

export type ExecutorEvent = {
  retry: number
  waitingPeriodMs: number
  nextTry: Date
  event: ethers.Event
}

export type ExecutorState = {
  eventsQueue: ExecutorEvent[]
  registry: ethers.Contract
  provider: ethers.providers.JsonRpcProvider
  lastBlockNumber: number
  wallet: ethers.Wallet
}

export declare class ChugSplashExecutorType extends BaseServiceV2<
  ExecutorOptions,
  ExecutorMetrics,
  ExecutorState
> {
  constructor(options?: Partial<ExecutorOptions>)
  setup(
    options: Partial<ExecutorOptions>,
    provider?: ethers.providers.JsonRpcProvider
  ): Promise<void>
  init(): Promise<void>
  main(
    canonicalConfigFolderPath?: string,
    integration?: Integration,
    remoteExecution?: boolean
  ): Promise<void>
}
