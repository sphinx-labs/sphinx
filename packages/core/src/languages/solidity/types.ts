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

/**
 * Container object returned by the Solidity compiler. See
 * https://docs.soliditylang.org/en/v0.8.3/internals/layout_in_storage.html for more information.
 */
export interface SolidityStorageLayout {
  storage: SolidityStorageObj[]
  types: {
    [name: string]: SolidityStorageType
  }
}

export interface StorageSlotPair {
  key: string
  val: string
}

export interface StorageSlotMapping {
  [key: string]: string
}

export interface CompilerInput {
  language: string
  sources: { [sourceName: string]: { content: string } }
  settings: {
    optimizer: { runs?: number; enabled?: boolean }
    metadata?: { useLiteralContent: boolean }
    outputSelection: {
      [sourceName: string]: {
        [contractName: string]: string[]
      }
    }
    evmVersion?: string
    libraries?: {
      [libraryFileName: string]: {
        [libraryName: string]: string
      }
    }
  }
}

export interface CompilerOutputContract {
  abi: any
  evm: {
    bytecode: CompilerOutputBytecode
    deployedBytecode: CompilerOutputBytecode
    methodIdentifiers: {
      [methodSignature: string]: string
    }
  }
}

export interface CompilerOutput {
  sources: CompilerOutputSources
  contracts: {
    [sourceName: string]: {
      [contractName: string]: CompilerOutputContract
    }
  }
}

export interface CompilerOutputSource {
  id: number
  ast: {
    id: number
    exportedSymbols: { [contractName: string]: number[] }
  }
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
