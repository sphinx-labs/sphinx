import { Fragment } from 'ethers/lib/utils'
import { CompilerInput } from 'hardhat/types'
import { SourceUnit } from 'solidity-ast'

/**
 * Represents the JSON objects outputted by the Solidity compiler that describe the structure of
 * state within the contract. See
 * https://docs.soliditylang.org/en/v0.8.3/internals/layout_in_storage.html for more information.
 */
export interface SolidityStorageObj {
  astId: number
  contract: string
  label: string
  offset: number
  slot: string
  type: string
}

export interface ExtendedSolidityStorageObj extends SolidityStorageObj {
  configVarName: string
}

/**
 * Represents the JSON objects outputted by the Solidity compiler that describe the types used for
 * the various pieces of state in the contract. See
 * https://docs.soliditylang.org/en/v0.8.3/internals/layout_in_storage.html for more information.
 */
export interface SolidityStorageType {
  encoding: 'inplace' | 'mapping' | 'dynamic_array' | 'bytes'
  label: string
  numberOfBytes: number
  key?: string
  value?: string
  base?: string
  members?: SolidityStorageObj[]
}

export interface SolidityStorageTypes {
  [name: string]: SolidityStorageType
}

/**
 * Container object returned by the Solidity compiler. See
 * https://docs.soliditylang.org/en/v0.8.3/internals/layout_in_storage.html for more information.
 */
export interface SolidityStorageLayout {
  storage: SolidityStorageObj[]
  types: SolidityStorageTypes
}

export interface ExtendedStorageLayout extends SolidityStorageLayout {
  storage: ExtendedSolidityStorageObj[]
}

export interface StorageSlotSegment {
  key: string
  offset: number
  val: string
}

export type BuildInfo = {
  id: string
  solcVersion: string
  solcLongVersion: string
  input: CompilerInput
  output: CompilerOutput
}

export type ContractArtifact = {
  abi: Array<Fragment>
  sourceName: string
  contractName: string
  bytecode: string
  deployedBytecode: string
}

export interface CompilerOutputMetadata {
  sources: {
    [sourceName: string]: {
      keccak256: string
      license: string
      urls: string[]
    }
  }
  output: any
}

export interface CompilerOutputContract {
  abi: Array<Fragment>
  storageLayout?: SolidityStorageLayout
  evm: {
    bytecode: CompilerOutputBytecode
    deployedBytecode: CompilerOutputBytecode
    methodIdentifiers: {
      [methodSignature: string]: string
    }
  }
  metadata: string | CompilerOutputMetadata
}

export interface CompilerOutputContracts {
  [sourceName: string]: {
    [contractName: string]: CompilerOutputContract
  }
}

export interface CompilerOutput {
  sources: CompilerOutputSources
  contracts: CompilerOutputContracts
  errors?: any[]
}

export interface CompilerOutputSource {
  id: number
  ast: SourceUnit
}

export interface CompilerOutputSources {
  [sourceName: string]: CompilerOutputSource
}

export interface CompilerOutputBytecode {
  object: string
  opcodes: string
  sourceMap: string
  linkReferences: {
    [sourceName: string]: {
      [libraryName: string]: Array<{ start: number; length: 20 }>
    }
  }
  immutableReferences?: {
    [key: string]: Array<{ start: number; length: number }>
  }
}

export type ChugSplashSystemConfig = {
  executors: string[]
  proposers: string[]
  callers: string[]
}
