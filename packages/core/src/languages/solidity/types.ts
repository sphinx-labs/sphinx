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
  slot: number
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
  numberOfBytes: number
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
