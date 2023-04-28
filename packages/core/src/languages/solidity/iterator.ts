import { BigNumber, utils } from 'ethers'
import { ASTDereferencer } from 'solidity-ast/utils'

import { ParsedConfigVariable, UserConfigVariable } from '../../config'
import { keywords } from '../../constants'
import {
  SolidityStorageObj,
  SolidityStorageType,
  SolidityStorageTypes,
} from './types'

export type VariableHandlerProps<Input, Output> = {
  variable: Extract<Input, UserConfigVariable>
  storageObj: SolidityStorageObj
  storageTypes: SolidityStorageTypes
  nestedSlotOffset: string
  slotKey: string
  variableType: SolidityStorageType
  typeHandlers: VariableHandlers<Output>
  dereferencer: ASTDereferencer
}

export type VariableHandler<Input, Output> = (
  props: VariableHandlerProps<Input, Output>
) => Output

export type VariableHandlers<Output> = {
  inplace: {
    array: VariableHandler<UserConfigVariable, Output>
    address: VariableHandler<UserConfigVariable, Output>
    bool: VariableHandler<UserConfigVariable, Output>
    bytes: VariableHandler<UserConfigVariable, Output>
    uint: VariableHandler<UserConfigVariable, Output>
    int: VariableHandler<UserConfigVariable, Output>
    struct: VariableHandler<UserConfigVariable, Output>
  }
  bytes: VariableHandler<UserConfigVariable, Output>
  mapping: VariableHandler<UserConfigVariable, Output>
  dynamic_array: VariableHandler<UserConfigVariable, Output>
  preserve: VariableHandler<UserConfigVariable, Output>
  function: VariableHandler<UserConfigVariable, Output>
}

export const isKeyword = (
  variableValue: UserConfigVariable,
  keyword: string
): boolean => {
  if (
    typeof variableValue === 'string' &&
    // Remove whitespaces from the variable, then lowercase it
    variableValue.replace(/\s+/g, '').toLowerCase() === keyword
  ) {
    return true
  } else {
    return false
  }
}

export const variableContainsKeyword = (
  variable: UserConfigVariable,
  keyword: string
): boolean => {
  if (isKeyword(variable, keyword)) {
    return true
  } else if (Array.isArray(variable)) {
    for (const element of variable) {
      if (variableContainsKeyword(element, keyword)) {
        return true
      }
    }
    return false
  } else if (typeof variable === 'object') {
    for (const varValue of Object.values(variable)) {
      if (variableContainsKeyword(varValue, keyword)) {
        return true
      }
    }
    return false
  } else if (
    typeof variable === 'boolean' ||
    typeof variable === 'number' ||
    typeof variable === 'string' ||
    variable === undefined
  ) {
    return false
  } else {
    throw new Error(
      `Detected unknown variable type, ${typeof variable}, for variable: ${variable}.`
    )
  }
}

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
  const added = BigNumber.from(firstSlotKey).add(BigNumber.from(secondSlotKey))
  return utils.hexZeroPad(added.toHexString(), 32)
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
    encodedMappingKey = utils.solidityPack(
      [mappingKeyStorageType.label],
      [mappingKey]
    )
  } else if (mappingKeyStorageType.encoding === 'inplace') {
    // Use the standard ABI encoder if the mapping key is a value type (as opposed to a
    // reference type).
    encodedMappingKey = utils.defaultAbiCoder.encode(
      [mappingKeyStorageType.label],
      [mappingKey]
    )
  } else {
    // This error should never occur unless Solidity adds a new encoding type, or allows dynamic
    // arrays or mappings to be mapping keys.
    throw new Error(
      `Unsupported mapping key encoding: ${mappingKeyStorageType.encoding}. Should never happen.`
    )
  }

  // Get the mapping value's storage slot key by first concatenating the encoded mapping key to the
  // storage slot key of the mapping itself, then hashing the concatenated value.
  const mappingValueStorageSlotKey = utils.keccak256(
    utils.hexConcat([encodedMappingKey, slotKey])
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

export const recursiveLayoutIterator = <Output>(
  variable: ParsedConfigVariable | UserConfigVariable,
  storageObj: SolidityStorageObj,
  storageTypes: SolidityStorageTypes,
  nestedSlotOffset: string,
  typeHandlers: VariableHandlers<Output>,
  dereferencer: ASTDereferencer
): Output => {
  // The current slot key is the slot key of the current storage object plus the `nestedSlotOffset`.
  const slotKey = addStorageSlotKeys(storageObj.slot, nestedSlotOffset)

  const variableType = getStorageType(
    storageObj.type,
    storageTypes,
    dereferencer
  )

  // Handle the preserve keyword
  if (isKeyword(variable, keywords.preserve)) {
    return typeHandlers.preserve({
      variable,
      storageObj,
      storageTypes,
      nestedSlotOffset,
      slotKey,
      variableType,
      typeHandlers,
      dereferencer,
    })
  }

  // The Solidity compiler uses four encodings to encode state variables: "inplace", "mapping",
  // "dynamic_array", and "bytes". Each state variable is assigned an encoding depending on its
  // type.
  // ref: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#storage-inplace-encoding

  // Variables with the "inplace" encoding have storage values that are laid out contiguously in
  // storage.
  if (variableType.encoding === 'inplace') {
    if (storageObj.type.startsWith('t_array')) {
      return typeHandlers.inplace.array({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (
      variableType.label.startsWith('address') ||
      variableType.label.startsWith('contract')
    ) {
      return typeHandlers.inplace.address({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (variableType.label === 'bool') {
      return typeHandlers.inplace.bool({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (variableType.label.startsWith('bytes')) {
      return typeHandlers.inplace.bytes({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (
      variableType.label.startsWith('uint') ||
      variableType.label.startsWith('enum') // Enums are handled identically to uint8
    ) {
      return typeHandlers.inplace.uint({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (variableType.label.startsWith('int')) {
      return typeHandlers.inplace.int({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (variableType.label.startsWith('struct')) {
      return typeHandlers.inplace.struct({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else if (
      storageObj.type.startsWith('t_function_internal') ||
      storageObj.type.startsWith('t_function_external')
    ) {
      return typeHandlers.function({
        variable,
        storageObj,
        storageTypes,
        nestedSlotOffset,
        slotKey,
        variableType,
        typeHandlers,
        dereferencer,
      })
    } else {
      throw new Error(
        `Could not encode inplace variable: ${variableType.label}. Should never happen.`
      )
    }
  } else if (variableType.encoding === 'bytes') {
    return typeHandlers.bytes({
      variable,
      storageObj,
      storageTypes,
      nestedSlotOffset,
      slotKey,
      variableType,
      typeHandlers,
      dereferencer,
    })
  } else if (variableType.encoding === 'mapping') {
    return typeHandlers.mapping({
      variable,
      storageObj,
      storageTypes,
      nestedSlotOffset,
      slotKey,
      variableType,
      typeHandlers,
      dereferencer,
    })
  } else if (variableType.encoding === 'dynamic_array') {
    return typeHandlers.dynamic_array({
      variable,
      storageObj,
      storageTypes,
      nestedSlotOffset,
      slotKey,
      variableType,
      typeHandlers,
      dereferencer,
    })
  } else {
    // This error should never be triggered unless the Solidity compiler adds a new encoding type.
    throw new Error(
      `unknown unsupported type ${variableType.encoding} ${variableType.label}`
    )
  }
}
