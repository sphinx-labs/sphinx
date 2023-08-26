import { Fragment, Interface, InterfaceAbi } from 'ethers'
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
  numberOfBytes: string
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

// TODO(docs): abi is this type to match hardhat's type. it's not an ethers Fragment type b/c
// Fragments have add'l fields
export type ContractArtifact = {
  abi: Array<any>
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
  abi: Array<any>
  storageLayout?: SolidityStorageLayout
  evm: {
    bytecode: CompilerOutputBytecode
    deployedBytecode: CompilerOutputBytecode
    methodIdentifiers: {
      [methodSignature: string]: string
    }
    gasEstimates: {
      creation: {
        totalCost: string
        codeDepositCost: string
        executionCost: string
      }
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

export type SphinxSystemConfig = {
  executors: string[]
  relayers: string[]
  funders: string[]
}
