import { BaseServiceV2, LogLevel } from '@eth-optimism/common-ts'
import { Address } from '@eth-optimism/core-utils'
import { StorageLayout } from '@openzeppelin/upgrades-core'
import { ethers } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { ParsedContractConfig } from './config'
import { Integration } from './constants'

// Used when linking bytecode to external libraries.
// Borrowed from hardhat ethers plugin.
export interface Link {
  sourceName: string
  libraryName: string
  address: string
}

export type Libraries = {
  [libraryName: string]: Address
}

export type ChugSplashRuntimeEnvironment = {
  configPath: string
  canonicalConfigPath: string | undefined
  remoteExecution: boolean
  autoConfirm: boolean
  stream: NodeJS.WritableStream
  silent: boolean
  hre: HardhatRuntimeEnvironment | undefined
  importOpenZeppelinStorageLayout: (
    hre: HardhatRuntimeEnvironment,
    parsedContractConfig: ParsedContractConfig
  ) => Promise<StorageLayout | undefined>
}

export type FoundryContractArtifact = {
  referenceName: string
  contractName: string
  contractAddress: string
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
  event: ethers.Event
}

export type ExecutorState = {
  eventsQueue: ExecutorEvent[]
  executionCache: ExecutorEvent[]
  registry: ethers.Contract
  provider: ethers.providers.JsonRpcProvider
  lastBlockNumber: number
  keys: ExecutorKey[]
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
