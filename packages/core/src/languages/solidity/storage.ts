import { ethers, utils } from 'ethers'
import { ASTDereferencer } from 'solidity-ast/utils'
import { ContractDefinition } from 'solidity-ast'
import 'core-js/features/array/at'

import {
  ParsedContractConfig,
  ParsedConfigVariable,
  ParsedConfigVariables,
} from '../../config/types'
import {
  ExtendedSolidityStorageObj,
  ExtendedStorageLayout,
  SolidityStorageLayout,
  SolidityStorageObj,
  SolidityStorageTypes,
  StorageSlotSegment,
} from './types'
import {
  addStorageSlotKeys,
  buildMappingStorageObj,
  getStorageType,
  recursiveLayoutIterator,
  VariableHandler,
  VariableHandlerProps,
  VariableHandlers,
} from './iterator'

/**
 * Encodes the elements of an array as a series of key/value storage slot pairs using the Solidity
 * storage layout. This function is used whenever the encoding of the array is `inplace` (for fixed
 * size arrays) or `dynamic_array`, but not `bytes`, which is used for dynamic bytes and strings.
 * Works recursively with the `encodeVariable` function.
 *
 * @param array Array to encode as key/value slot pairs.
 * @param storageObj Solidity compiler JSON output describing the layout for this array.
 * @param storageTypes Full list of storage types allowed for this encoding.
 * @param nestedSlotOffset Keeps track of a value to be added onto the storage slot key. Only used
 * if the array is within a struct.
 * @returns Array encoded as a series of key/value slot pairs.
 */
export const encodeArrayElements = (
  array: ParsedConfigVariable[],
  storageObj: SolidityStorageObj,
  storageTypes: SolidityStorageTypes,
  elementSlotKey: string,
  nestedSlotOffset: string,
  typeHandlers: VariableHandlers<Array<StorageSlotSegment>>,
  dereferencer: ASTDereferencer
): Array<StorageSlotSegment> => {
  const elementType = getStorageType(
    storageObj.type,
    storageTypes,
    dereferencer
  ).base

  if (elementType === undefined) {
    throw new Error(
      `Could not encode array elements for: ${storageObj.label}. Should never happen.`
    )
  }

  const elementStorageType = getStorageType(
    elementType,
    storageTypes,
    dereferencer
  )
  const bytesPerElement = Number(elementStorageType.numberOfBytes)

  // Calculate the number of slots to increment when iterating over the array elements. This
  // number is only ever greater than one if `bytesPerElement` > 32, which could happen if the
  // array element type is large, e.g. a struct.
  const numSlotsToIncrement = Math.ceil(bytesPerElement / 32)

  // Arrays always start at a new storage slot with an offset of zero.
  let bytesOffset = 0

  // Iterate over the array and encode each element in it.
  let slots: Array<StorageSlotSegment> = []
  for (const element of array) {
    slots = slots.concat(
      recursiveLayoutIterator<Array<StorageSlotSegment>>(
        element,
        // We must manually create a `storageObj` for each element since the Solidity
        // compiler does not create them.
        {
          astId: storageObj.astId,
          contract: storageObj.contract,
          label: storageObj.label,
          offset: bytesOffset,
          slot: elementSlotKey,
          type: elementType,
        },
        storageTypes,
        nestedSlotOffset,
        typeHandlers,
        dereferencer
      )
    )
    // Increment the bytes offset every time we iterate over an element.
    bytesOffset += bytesPerElement

    if (bytesOffset + bytesPerElement > 32) {
      // Increment the storage slot key and reset the offset if the next element will not fit in
      // the current storage slot.
      elementSlotKey = addStorageSlotKeys(
        elementSlotKey,
        numSlotsToIncrement.toString()
      )
      bytesOffset = 0
    }
  }
  return slots
}

/**
 * Encodes a bytes/string value of length > 31 bytes as a series of key/value storage slot pairs
 * using the Solidity storage layout.
 *
 * @param array Bytes array to encode.
 * @param elementSlotKey The key of the slot where the beginning of the array is stored.
 * @returns Array encoded as a series of key/value slot pairs.
 */
export const encodeBytesArrayElements = (
  array: Uint8Array,
  elementSlotKey: string
): Array<StorageSlotSegment> => {
  const slots: Array<StorageSlotSegment> = []

  // Iterate over the beginning and middle chunks of the array and encode each element in it. We use
  // a while loop instead of a for loop because we need to use `i` after the loop terminates.
  let i = 0
  while (i + 32 < array.length) {
    slots.push({
      key: elementSlotKey,
      offset: 0,
      val: ethers.utils.hexlify(array.subarray(i, i + 32)),
    })
    elementSlotKey = addStorageSlotKeys(elementSlotKey, '1')
    i += 32
  }

  // Encode the last chunk of the array.
  const endChunk = array.subarray(i, i + 32)
  const zeros = new Array(32 - endChunk.length).fill(0)

  slots.push({
    key: elementSlotKey,
    offset: 0, // Always 0 because the storage value spans the entire slot regardless of size
    val: ethers.utils.hexConcat([endChunk, zeros]),
  })

  return slots
}

/**
 * Handles encoding fixed-size arrays
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceArray: VariableHandler<
  Array<ParsedConfigVariable>,
  Array<StorageSlotSegment>
> = (
  props: VariableHandlerProps<
    Array<ParsedConfigVariable>,
    Array<StorageSlotSegment>
  >
) => {
  const {
    storageObj,
    variable,
    storageTypes,
    nestedSlotOffset,
    typeHandlers,
    dereferencer,
  } = props

  // Set the initial slot key of the array's elements to be the array's slot key.
  // This number will be incremented each time an element no longer fits in the
  // current storage slot.
  const elementSlotKey = storageObj.slot

  return encodeArrayElements(
    variable,
    storageObj,
    storageTypes,
    elementSlotKey,
    nestedSlotOffset,
    typeHandlers,
    dereferencer
  )
}

/**
 * Handles encoding an address
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceAddress: VariableHandler<
  string,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<string, Array<StorageSlotSegment>>) => {
  const { storageObj, variable, slotKey } = props

  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: variable,
    },
  ]
}

/**
 * Handles encoding a boolean
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceBool: VariableHandler<
  boolean,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<boolean, Array<StorageSlotSegment>>) => {
  const { storageObj, variable, slotKey } = props

  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: variable ? '0x01' : '0x00',
    },
  ]
}

/**
 * Handles encoding fixed size bytesN, where N is in the range [1, 32]. Dynamic bytes are handled
 * elsewhere.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceBytes: VariableHandler<
  string,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<string, Array<StorageSlotSegment>>) => {
  const { storageObj, variable, slotKey } = props

  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: variable,
    },
  ]
}

/**
 * Handles encoding uints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceUint: VariableHandler<
  string,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<string, Array<StorageSlotSegment>>) => {
  const { storageObj, variable, slotKey, variableType } = props

  // Convert enum types to uint8 because the `solidityPack` function doesn't support enum types.
  const uintType = variableType.label.startsWith('enum')
    ? 'uint8'
    : variableType.label

  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: utils.solidityPack([uintType], [variable]),
    },
  ]
}

/**
 * Handles encoding ints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceInt: VariableHandler<
  string,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<string, Array<StorageSlotSegment>>) => {
  const { storageObj, variable, slotKey, variableType } = props

  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: utils.solidityPack([variableType.label], [variable]),
    },
  ]
}

/**
 * Handles encoding structs
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeInplaceStruct: VariableHandler<
  ParsedConfigVariables,
  Array<StorageSlotSegment>
> = (
  props: VariableHandlerProps<ParsedConfigVariables, Array<StorageSlotSegment>>
) => {
  const {
    variable,
    storageTypes,
    variableType,
    slotKey,
    typeHandlers,
    dereferencer,
  } = props

  // Structs are encoded recursively, as defined by their `members` field.
  let slots: Array<StorageSlotSegment> = []
  for (const [varName, varVal] of Object.entries(variable)) {
    if (!variableType.members) {
      // Solidiy prevents defining empty structs.
      throw new Error(
        `Struct does not contain a \`members\` field. Should never happen.`
      )
    }

    const memberStorageObj = variableType.members.find((member) => {
      return member.label === varName
    })

    if (!memberStorageObj) {
      throw new Error(
        `Struct member ${varName} not found in storage type ${variableType.label}. Should never happen.`
      )
    }

    slots = slots.concat(
      recursiveLayoutIterator<Array<StorageSlotSegment>>(
        varVal,
        memberStorageObj,
        storageTypes,
        slotKey,
        typeHandlers,
        dereferencer
      )
    )
  }
  return slots
}

/**
 * Handles encoding dynamic bytes
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeBytes: VariableHandler<string, Array<StorageSlotSegment>> = (
  props: VariableHandlerProps<string, Array<StorageSlotSegment>>
) => {
  const { variable, storageObj, variableType, slotKey } = props

  // Convert the variable to a Uint8Array.
  const bytes =
    variableType.label === 'string'
      ? ethers.utils.toUtf8Bytes(variable)
      : utils.arrayify(variable)

  if (bytes.length < 32) {
    const zeros = new Array(32 - bytes.length - 1).fill(0)

    // Solidity docs (see above) specifies that strings or bytes with a length of 31 bytes
    // should be placed into a storage slot where the last byte of the storage slot is the length
    // of the variable in bytes * 2.
    return [
      {
        key: slotKey,
        offset: storageObj.offset,
        val: ethers.utils.hexConcat([bytes, zeros, [bytes.length * 2]]),
      },
    ]
  } else {
    let slots = [
      {
        key: slotKey,
        offset: storageObj.offset,
        val: ethers.utils.hexZeroPad([bytes.length * 2 + 1], 32),
      },
    ]

    slots = slots.concat(
      encodeBytesArrayElements(
        bytes,
        utils.keccak256(slotKey) // The slot key of the array elements begins at the hash of the `slotKey`.
      )
    )
    return slots
  }
}

/**
 * Handles encoding mappings
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeMapping: VariableHandler<
  ParsedConfigVariables,
  Array<StorageSlotSegment>
> = (
  props: VariableHandlerProps<ParsedConfigVariables, Array<StorageSlotSegment>>
) => {
  const {
    variable,
    storageObj,
    variableType,
    slotKey,
    storageTypes,
    typeHandlers,
    dereferencer,
  } = props

  // Iterate over every key/value in the mapping to get the storage slot pair for each one.
  let slots: Array<StorageSlotSegment> = [
    {
      key: slotKey,
      offset: 0,
      val: ethers.constants.HashZero,
    },
  ]
  for (const [mappingKey, mappingVal] of Object.entries(variable)) {
    const mappingValStorageObj = buildMappingStorageObj(
      storageTypes,
      variableType,
      mappingKey,
      slotKey,
      storageObj,
      dereferencer
    )

    // Encode the storage slot key/value for the mapping value. Note that we set
    // `nestedSlotOffset` to '0' because it isn't used when calculating the storage slot
    // key (we already calculated the storage slot key above).
    slots = slots.concat(
      recursiveLayoutIterator<Array<StorageSlotSegment>>(
        mappingVal,
        mappingValStorageObj,
        storageTypes,
        '0',
        typeHandlers,
        dereferencer
      )
    )
  }
  return slots
}

/**
 * Handles encoding dynamically-sized arrays
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodeDynamicArray: VariableHandler<
  Array<ParsedConfigVariable>,
  Array<StorageSlotSegment>
> = (
  props: VariableHandlerProps<
    Array<ParsedConfigVariable>,
    Array<StorageSlotSegment>
  >
) => {
  const {
    variable,
    storageObj,
    nestedSlotOffset,
    slotKey,
    storageTypes,
    typeHandlers,
    dereferencer,
  } = props

  // For dynamic arrays, the current storage slot stores the number of elements in the array (byte
  // arrays and strings are an exception since they use the encoding 'bytes').
  let slots = [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: ethers.utils.hexZeroPad([variable.length], 32),
    },
  ]

  // Calculate the storage slots of the array elements and concatenate it to the current `slots`
  // array.
  slots = slots.concat(
    encodeArrayElements(
      variable,
      storageObj,
      storageTypes,
      utils.keccak256(slotKey), // The slot key of the array elements begins at the hash of the `slotKey`.
      nestedSlotOffset,
      typeHandlers,
      dereferencer
    )
  )
  return slots
}

/**
 * Handles encoding preserved variables
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const encodePreserve: VariableHandler<
  string,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<string, Array<StorageSlotSegment>>) => {
  const { storageObj, slotKey } = props

  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: '0x',
    },
  ]
}

/**
 * Handles encoding function types. Since we do not support defining function types in the
 * ChugSplash config, we just zero out the storage slot.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns A encoded storage slot with a value of 0 for the function type.
 */
export const encodeFunction: VariableHandler<
  string,
  Array<StorageSlotSegment>
> = (props: VariableHandlerProps<string, Array<StorageSlotSegment>>) => {
  const { storageObj, slotKey, variableType } = props

  // We want to zero out the storage slot for function types.
  // Since internal and external functions have different sizes, we need to
  // zero out the correct number of bytes for each.
  return [
    {
      key: slotKey,
      offset: storageObj.offset,
      val: '0x' + '00'.repeat(variableType.numberOfBytes),
    },
  ]
}

/**
 * Encodes a single variable as a series of key/value storage slot pairs using the Solidity storage
 * layout as instructions for how to perform this encoding. Works recursively with complex data
 * types. ref:
 * https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
 *
 * @param variable Variable to encode as key/value slot pairs.
 * @param storageObj Solidity compiler JSON output describing the layout for this variable.
 * @param storageTypes Full list of storage types allowed for this encoding.
 * @param nestedSlotOffset Keeps track of a value to be added onto the storage slot key. Only used
 * for members of structs.
 * @returns Variable encoded as a series of key/value slot pairs.
 */
export const encodeVariable = (
  variable: ParsedConfigVariable,
  storageObj: SolidityStorageObj,
  storageTypes: SolidityStorageTypes,
  nestedSlotOffset: string,
  dereferencer: ASTDereferencer
): Array<StorageSlotSegment> => {
  const typeHandlers: VariableHandlers<Array<StorageSlotSegment>> = {
    inplace: {
      array: encodeInplaceArray,
      address: encodeInplaceAddress,
      bool: encodeInplaceBool,
      bytes: encodeInplaceBytes,
      uint: encodeInplaceUint,
      int: encodeInplaceInt,
      struct: encodeInplaceStruct,
    },
    bytes: encodeBytes,
    mapping: encodeMapping,
    dynamic_array: encodeDynamicArray,
    preserve: encodePreserve,
    function: encodeFunction,
  }

  return recursiveLayoutIterator<Array<StorageSlotSegment>>(
    variable,
    storageObj,
    storageTypes,
    nestedSlotOffset,
    typeHandlers,
    dereferencer
  )
}

/**
 * Computes the storage slot segments that would be used if a given set of variable values were
 * applied to a given contract.
 *
 * @param extendedLayout Solidity storage layout to use as a template for determining storage slots.
 * @param contractConfig Variable values to apply against the given storage layout.
 * @returns An array of storage slot segments that would result in the desired state.
 */
export const computeStorageSegments = (
  extendedLayout: ExtendedStorageLayout,
  contractConfig: ParsedContractConfig,
  dereferencer: ASTDereferencer
): Array<StorageSlotSegment> => {
  if (contractConfig.kind === 'no-proxy') {
    return []
  }

  let segments: StorageSlotSegment[] = []
  for (const storageObj of Object.values(extendedLayout.storage)) {
    const configVarValue = contractConfig.variables[storageObj.configVarName]
    // Encode this variable as a series of storage slot key/value pairs and save it.
    segments = segments.concat(
      encodeVariable(
        configVarValue,
        storageObj,
        extendedLayout.types,
        '0',
        dereferencer
      )
    )
  }

  const slotKeyToSegmentArray: {
    [slotKey: string]: Array<StorageSlotSegment>
  } = {}

  for (const segment of segments) {
    if (slotKeyToSegmentArray[segment.key] === undefined) {
      slotKeyToSegmentArray[segment.key] = [segment]
    } else {
      slotKeyToSegmentArray[segment.key].push(segment)
    }
  }

  let combinedSegments: Array<StorageSlotSegment> = []
  for (const groupedSegments of Object.values(slotKeyToSegmentArray)) {
    const sortedSegments = groupedSegments.sort((seg1, seg2) => {
      return seg1.offset - seg2.offset
    })

    const combined: Array<StorageSlotSegment> = sortedSegments.reduce(
      (prevSegments: Array<StorageSlotSegment>, segment) => {
        const prevSegment = prevSegments.at(-1)
        if (prevSegment === undefined) {
          prevSegments.push(segment)
        } else {
          const numBytes = ethers.utils.arrayify(prevSegment.val).length
          if (prevSegment.offset + numBytes > segment.offset) {
            // Should never happen, means our encoding is broken. Values should *never* overlap.
            throw new Error(
              `Detected overlapping storage slot values. Please report this error.`
            )
          } else if (segment.offset === prevSegment.offset + numBytes) {
            // First, we remove the previous slot from the list of slots since we'll be modifying it.
            prevSegments.pop()

            prevSegments.push({
              key: prevSegment.key,
              offset: prevSegment.offset,
              val: utils.hexConcat([segment.val, prevSegment.val]),
            })
          } else {
            prevSegments.push(segment)
          }
        }

        return prevSegments
      },
      []
    )

    combinedSegments = combinedSegments.concat(combined)
  }

  return segments
}

/**
 * Extends a given storage layout. In particular, this function adds a `configVarName` field to each
 * member of the `storageLayout.storage` array. This ensures that each config variable name in a
 * contract definition is unique.
 *
 * @param storageLayout The storage layout to extend.
 * @param derefencer AST Dereferencer.
 * @returns Extended storage layout.
 */
export const extendStorageLayout = (
  storageLayout: SolidityStorageLayout,
  derefencer: ASTDereferencer
): ExtendedStorageLayout => {
  const extendedStorage: ExtendedSolidityStorageObj[] = []
  for (const currStorageObj of storageLayout.storage) {
    const sameLabels = storageLayout.storage.filter(
      (storageObj) =>
        storageObj.label === currStorageObj.label &&
        storageObj.astId !== currStorageObj.astId
    )

    let extendedStorageObj: ExtendedSolidityStorageObj
    if (sameLabels.length === 0) {
      extendedStorageObj = {
        ...currStorageObj,
        configVarName: currStorageObj.label,
      }
    } else {
      const currContractName = getContractNameForStorageObj(
        currStorageObj,
        derefencer
      )
      const hasDuplicateContractName = sameLabels.some(
        (storageObj) =>
          getContractNameForStorageObj(storageObj, derefencer) ===
          currContractName
      )
      if (hasDuplicateContractName) {
        // Extend the current storage object with the contract's fully qualified name.
        const fullyQualifiedName = getFullyQualifiedNameForStorageObj(
          currStorageObj,
          derefencer
        )
        extendedStorageObj = {
          ...currStorageObj,
          configVarName: `${fullyQualifiedName}:${currStorageObj.label}`,
        }
      } else {
        // Extend the current storage object with the contract name.
        extendedStorageObj = {
          ...currStorageObj,
          configVarName: `${currContractName}:${currStorageObj.label}`,
        }
      }
    }
    extendedStorage.push(extendedStorageObj)
  }

  return {
    storage: extendedStorage,
    types: storageLayout.types,
  }
}

export const getContractNameForStorageObj = (
  storageObj: SolidityStorageObj,
  derefencer: ASTDereferencer
): string => {
  const contractNode = getContractDefinitionNodeForStorageObj(
    storageObj,
    derefencer
  )
  return contractNode.name
}

export const getFullyQualifiedNameForStorageObj = (
  storageObj: SolidityStorageObj,
  derefencer: ASTDereferencer
): string => {
  const contractNode = getContractDefinitionNodeForStorageObj(
    storageObj,
    derefencer
  )
  const sourceUnit = derefencer(['SourceUnit'], contractNode.scope)
  return `${sourceUnit.absolutePath}:${contractNode.name}`
}

export const getContractDefinitionNodeForStorageObj = (
  storageObj: SolidityStorageObj,
  derefencer: ASTDereferencer
): ContractDefinition => {
  const varDeclNode = derefencer(['VariableDeclaration'], storageObj.astId)
  return derefencer(['ContractDefinition'], varDeclNode.scope)
}
