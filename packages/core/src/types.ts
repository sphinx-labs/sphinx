import { BaseServiceV2 } from '@eth-optimism/common-ts/dist/base-service/base-service-v2'
import { LogLevel } from '@eth-optimism/common-ts/dist/common/logger'
import { StorageLayout } from '@openzeppelin/upgrades-core/dist/storage/layout'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { Contract, Event, providers } from 'ethers'

import { ParsedContractConfig } from './config/types'

export type SphinxRuntimeEnvironment = {
  canonicalConfigPath: string
  remoteExecution: boolean
  confirmUpgrade: boolean
  stream: NodeJS.WritableStream
  silent: boolean
  hre: HardhatRuntimeEnvironment | undefined
  importOpenZeppelinStorageLayout: (
    hre: HardhatRuntimeEnvironment,
    parsedContractConfig: ParsedContractConfig
  ) => Promise<StorageLayout>
}

/**
 * @param EXIT Exit the process without throwing an error. This cannot be caught in a try/catch.
 * Should be used in the Hardhat plugin.
 * @param THROW Throw an error. Can be caught in a try/catch. This should be used in the Foundry plugin.
 */
export enum FailureAction {
  EXIT, // Exit the process without throwing an error. This cannot be caught in a try/catch.
  THROW, // Throw an error. Can be caught in a try/catch.
}

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
  event: Event
}

export type ExecutorState = {
  eventsQueue: ExecutorEvent[]
  executionCache: ExecutorEvent[]
  registry: Contract
  provider: providers.JsonRpcProvider
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
    provider?: providers.JsonRpcProvider
  ): Promise<void>
  init(): Promise<void>
  main(): Promise<void>
}

export enum ProposalRoute {
  RELAY,
  REMOTE_EXECUTION,
  LOCAL_EXECUTION,
}
