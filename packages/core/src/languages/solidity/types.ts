import {
  CompilerOutputMetadata,
  SolidityStorageLayout,
  SolidityStorageObj,
} from '@sphinx-labs/contracts'
import { CompilerInput } from 'hardhat/types'
import { SourceUnit } from 'solidity-ast'

export interface ExtendedSolidityStorageObj extends SolidityStorageObj {
  configVarName: string
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
  relayers: string[]
}
