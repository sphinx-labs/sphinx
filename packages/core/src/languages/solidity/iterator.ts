import {
  toBeHex,
  AbiCoder,
  keccak256,
  concat,
  solidityPacked,
  zeroPadValue,
} from 'ethers'
import { ASTDereferencer } from 'solidity-ast/utils'
import 'core-js/features/array/at'
import {
  SolidityStorageObj,
  SolidityStorageType,
  SolidityStorageTypes,
} from '@sphinx-labs/contracts'

/**
 * Adds two storage slot keys. Each input key will be interpreted as hexadecimal if 0x-prefixed, and
 * decimal otherwise.
 *
 * @param firstSlotKey First storage slot key.
 * @param secondSlotKey Second storage slot key.
 * @returns A 32-byte hex string storage slot key.
 */
export const addStorageSlotKeys = (
  firstSlotKey: string,
  secondSlotKey: string
): string => {
  const added = BigInt(firstSlotKey) + BigInt(secondSlotKey)
  return zeroPadValue(toBeHex(added), 32)
}

/**
 * Builds a storage layout object for a mapping from scratch. Used by both parsing and validation logic.
 *
 * @param storageTypes Storage layout types output by the Solidity Compiler.
 * @param variableType Mapping variable type.
 * @param mappingKey Relevant mapping key.
 * @param slotKey The storage slot key where this mapping value will be stored.
 * @param storageObj Solidity compiler JSON output describing the layout for this variable.
 * @returns
 */
export const buildMappingStorageObj = (
  storageTypes: SolidityStorageTypes,
  variableType: SolidityStorageType,
  mappingKey: string,
  slotKey: string,
  storageObj: SolidityStorageObj,
  dereferencer: ASTDereferencer
): SolidityStorageObj => {
  // Check that a `key` and `value` property exist. The Solidity compiler always includes these
  // properties for the storage objects of mappings, so these errors should never occur.
  if (variableType.key === undefined) {
    throw new Error(
      `Could not find mapping key in storage object for ${variableType.label}. Should never happen.`
    )
  } else if (variableType.value === undefined) {
    throw new Error(
      `Could not find mapping key in storage object for ${variableType.label}. Should never happen.`
    )
  }

  const mappingKeyStorageType = getStorageType(
    variableType.key,
    storageTypes,
    dereferencer
  )

  // Encode the mapping key according to its Solidity compiler encoding. The encoding for the
  // mapping key is 'bytes' if the mapping key is a string or dynamic bytes. Otherwise, the
  // encoding is 'inplace'. Shortly after we encode the mapping key, we will use it to compute
  // the mapping value's storage slot key.
  let encodedMappingKey: string
  if (mappingKeyStorageType.encoding === 'bytes') {
    // Encode the mapping key and leave it unpadded.
    encodedMappingKey = solidityPacked(
      [mappingKeyStorageType.label],
      [mappingKey]
    )
  } else if (mappingKeyStorageType.encoding === 'inplace') {
    let label: string
    if (mappingKeyStorageType.label.startsWith('enum')) {
      label = 'uint8'
    } else if (mappingKeyStorageType.label.startsWith('contract')) {
      label = 'address'
    } else {
      label = mappingKeyStorageType.label
    }

    // Use the standard ABI encoder if the mapping key is a value type (as opposed to a
    // reference type).
    encodedMappingKey = AbiCoder.defaultAbiCoder().encode([label], [mappingKey])
  } else {
    // This error should never occur unless Solidity adds a new encoding type, or allows dynamic
    // arrays or mappings to be mapping keys.
    throw new Error(
      `Unsupported mapping key encoding: ${mappingKeyStorageType.encoding}. Should never happen.`
    )
  }

  // Get the mapping value's storage slot key by first concatenating the encoded mapping key to the
  // storage slot key of the mapping itself, then hashing the concatenated value.
  const mappingValueStorageSlotKey = keccak256(
    concat([encodedMappingKey, slotKey])
  )

  // Create a new storage object for the mapping value since the Solidity compiler doesn't
  // generate one for us.
  const mappingValStorageObj: SolidityStorageObj = {
    astId: storageObj.astId,
    contract: storageObj.contract,
    label: storageObj.label, // The mapping value label is unused, so we just use the label of the mapping itself.
    offset: storageObj.offset,
    slot: mappingValueStorageSlotKey,
    type: variableType.value,
  }

  return mappingValStorageObj
}

export const getStorageType = (
  variableType: string,
  storageTypes: SolidityStorageTypes,
  dereferencer: ASTDereferencer
): SolidityStorageType => {
  if (!variableType.startsWith('t_userDefinedValueType')) {
    return storageTypes[variableType]
  } else {
    const userDefinedValueAstId = variableType.split(')').at(-1)

    if (userDefinedValueAstId === undefined) {
      throw new Error(
        `Could not find AST ID for variable type: ${variableType}. Should never happen.`
      )
    }

    const userDefinedValueNode = dereferencer(
      ['UserDefinedValueTypeDefinition'],
      parseInt(userDefinedValueAstId, 10)
    )

    const label =
      userDefinedValueNode.underlyingType.typeDescriptions.typeString
    if (label === undefined || label === null) {
      throw new Error(
        `Could not find label for user-defined value type: ${variableType}. Should never happen.`
      )
    }

    const { encoding, numberOfBytes } = storageTypes[variableType]
    return {
      label,
      encoding,
      numberOfBytes,
    }
  }
}
