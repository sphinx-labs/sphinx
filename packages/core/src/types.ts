import { BaseServiceV2, LogLevel } from '@eth-optimism/common-ts'
import { ethers } from 'ethers'
import * as Amplitude from '@amplitude/node'

export type FoundryContractArtifact = {
  referenceName: string
  contractName: string
  contractAddress: string
}

export type ExecutorOptions = {
  url: string
  network: string
  privateKey: string
  amplitudeKey: string
  logLevel: LogLevel
}
export type ExecutorMetrics = {}
export type ExecutorState = {
  eventsQueue: ethers.Event[]
  registry: ethers.Contract
  provider: ethers.providers.JsonRpcProvider
  lastBlockNumber: number
  amplitudeClient: Amplitude.NodeClient
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
    localBundleId?: string,
    canonicalConfigFolderPath?: string
  ): Promise<void>
}
