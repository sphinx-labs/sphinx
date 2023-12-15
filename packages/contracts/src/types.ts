export type DecodedApproveLeafData = {
  safeProxy: string
  moduleProxy: string
  merkleRootNonce: bigint
  numLeaves: bigint
  executor: string
  uri: string
  arbitraryChain: boolean
}

export type DecodedExecuteLeafData = {
  to: string
  value: bigint
  gas: bigint
  txData: string
  operation: bigint
  requireSuccess: boolean
}

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

export type GnosisSafeContractArtifact = {
  contractName: string
  sourceName: string
  abi: Array<any>
  bytecode: string
  deployedBytecode: string
  linkReferences: any
  deployedLinkReferences: any
}

export type FoundryContractArtifact = {
  abi: Array<any>
  sourceName: string
  contractName: string
  bytecode: string
  deployedBytecode: string
  methodIdentifiers: {
    [methodSignature: string]: string
  }
  metadata: CompilerOutputMetadata
  storageLayout: SolidityStorageLayout
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
