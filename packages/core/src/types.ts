import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { Integration } from './constants'

export type SemverVersion = {
  major: number
  minor: number
  patch: number
}

export type SphinxRuntimeEnvironment = {
  integration: Integration
  compilerConfigPath: string
  remoteExecution: boolean
  allowUnlimitedContractSize: boolean
  confirm: boolean
  stream: NodeJS.WritableStream
  silent: boolean
  hre: HardhatRuntimeEnvironment | undefined
  // importOpenZeppelinStorageLayout: (
  //   hre: HardhatRuntimeEnvironment,
  //   parsedContractConfig: ParsedContractConfig
  // ) => Promise<StorageLayout>
}

/**
 * @param EXIT Exit the process without throwing an error. This cannot be caught in a try/catch.
 * @param THROW Throw an error. Can be caught in a try/catch. This should be the default
 * FailureAction in the Foundry plugin.
 */
export enum FailureAction {
  EXIT,
  THROW,
}

export enum ProposalRoute {
  RELAY,
  REMOTE_EXECUTION,
  LOCAL_EXECUTION,
}
