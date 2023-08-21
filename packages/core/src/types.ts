import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { Integration } from './constants'

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
 * Should be used in the Hardhat plugin.
 * @param THROW Throw an error. Can be caught in a try/catch. This should be used in the Foundry plugin.
 */
export enum FailureAction {
  EXIT, // Exit the process without throwing an error. This cannot be caught in a try/catch.
  THROW, // Throw an error. Can be caught in a try/catch.
}

export enum ProposalRoute {
  RELAY,
  REMOTE_EXECUTION,
  LOCAL_EXECUTION,
}
