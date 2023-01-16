import { add0x, fromHexString, remove0x } from '@eth-optimism/core-utils'
import { BigNumber, ethers, utils } from 'ethers'

import { ParsedContractConfig } from '../../config'
import {
  SolidityStorageLayout,
  SolidityStorageObj,
  SolidityStorageType,
  StorageSlotPair,
} from './types'

/**
 * Takes a slot value (in hex), left-pads it with zeros, and displaces it by a given offset.
 *
 * @param val Hex string value to pad.
 * @param offset Number of bytes to offset from the right.
 * @return Padded hex string.
 */
export const padHexSlotValue = (val: string, offset: number): string => {
  return add0x(
    remove0x(val)
      .padStart(64 - offset * 2, '0') // Pad the start with 64 - offset zero bytes.
      .padEnd(64, '0') // Pad the end (up to 64 bytes) with zero bytes.
      .toLowerCase() // Making this lower case makes assertions more consistent later.
  )
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
  nestedSlotOffset: string
): string => {
  return add0x(
    remove0x(
      BigNumber.from(firstSlotKey)
        .add(BigNumber.from(nestedSlotOffset))
        .toHexString()
    ).padStart(64, '0')
  )
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
  variable: any,
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  nestedSlotOffset: string
): Array<StorageSlotPair> => {
  // The current slot key is the slot key of the current storage object plus the `nestedSlotOffset`.
  const slotKey = addStorageSlotKeys(storageObj.slot, nestedSlotOffset)

  const variableType = storageTypes[storageObj.type]

  // The Solidity compiler uses four encodings to encode state variables: "inplace", "mapping",
  // "dynamic_array", and "bytes". Each state variable is assigned an encoding depending on its
  // type.
  // ref: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#storage-inplace-encoding

  // Variables with the "inplace" encoding have storage values that are laid out contiguously in
  // storage.
  if (variableType.encoding === 'inplace') {
    if (storageObj.type.startsWith('t_array')) {
      // Set the initial slot key of the array's elements to be the array's slot key.
      // This number will be incremented each time an element no longer fits in the
      // current storage slot.
      const elementSlotKey = storageObj.slot

      return encodeArrayElements(
        variable,
        storageObj,
        storageTypes,
        elementSlotKey,
        nestedSlotOffset
      )
    } else if (
      variableType.label === 'address' ||
      variableType.label.startsWith('contract')
    ) {
      if (!ethers.utils.isAddress(variable)) {
        throw new Error(`invalid address type: ${variable}`)
      }

      return [
        {
          key: slotKey,
          val: padHexSlotValue(variable, storageObj.offset),
        },
      ]
    } else if (variableType.label === 'bool') {
      // Do some light parsing here to make sure "true" and "false" are recognized.
      if (typeof variable === 'string') {
        if (variable === 'false') {
          variable = false
        }
        if (variable === 'true') {
          variable = true
        }
      }

      if (typeof variable !== 'boolean') {
        throw new Error(`invalid bool type: ${variable}`)
      }

      return [
        {
          key: slotKey,
          val: padHexSlotValue(variable ? '1' : '0', storageObj.offset),
        },
      ]
    } else if (variableType.label.startsWith('bytes')) {
      // Since this variable's encoding is `inplace`, it is a bytesN, where N is in the range
      // [1, 32]. Dynamic bytes have an encoding of `bytes`, and are handled elsewhere in this
      // function.

      if (!ethers.utils.isHexString(variable, variableType.numberOfBytes)) {
        throw new Error(
          `invalid bytes${variableType.numberOfBytes} variable: ${variable}`
        )
      }

      return [
        {
          key: slotKey,
          val: padHexSlotValue(
            remove0x(variable).padEnd(variableType.numberOfBytes * 2, '0'),
            storageObj.offset
          ),
        },
      ]
    } else if (
      variableType.label.startsWith('uint') ||
      variableType.label.startsWith('enum') // Enums are handled identically to uint8
    ) {
      if (
        remove0x(BigNumber.from(variable).toHexString()).length / 2 >
        variableType.numberOfBytes
      ) {
        throw new Error(
          `provided ${variableType.label} is too big: ${variable}`
        )
      }

      return [
        {
          key: slotKey,
          val: padHexSlotValue(
            BigNumber.from(variable).toHexString(),
            storageObj.offset
          ),
        },
      ]
    } else if (variableType.label.startsWith('int')) {
      // Calculate the minimum and maximum values of the int to ensure that the variable fits within
      // these bounds.
      const minValue = BigNumber.from(2)
        .pow(8 * variableType.numberOfBytes)
        .div(2)
        .mul(-1)
      const maxValue = BigNumber.from(2)
        .pow(8 * variableType.numberOfBytes)
        .div(2)
        .sub(1)
      if (
        BigNumber.from(variable).lt(minValue) ||
        BigNumber.from(variable).gt(maxValue)
      ) {
        throw new Error(
          `provided ${variableType.label} size is too big: ${variable}`
        )
      }

      return [
        {
          key: slotKey,
          val: padHexSlotValue(
            ethers.utils.solidityPack([variableType.label], [variable]),
            storageObj.offset
          ),
        },
      ]
    } else if (variableType.label.startsWith('struct')) {
      // Structs are encoded recursively, as defined by their `members` field.
      let slots: Array<StorageSlotPair> = []
      if (variableType.members === undefined) {
        // The Solidity compiler prevents defining structs without any members, so this should
        // never occur.
        throw new Error(
          `Could not find any members in ${variableType.label}. Should never happen.`
        )
      }
      for (const [varName, varVal] of Object.entries(variable)) {
        const memberStorageObj = variableType.members.find((member) => {
          return member.label === varName
        })
        if (memberStorageObj === undefined) {
          throw new Error(
            `User entered incorrect member in ${variableType.label}: ${varName}`
          )
        }
        slots = slots.concat(
          encodeVariable(varVal, memberStorageObj, storageTypes, slotKey)
        )
      }
      return slots
    } else {
      throw new Error(
        `Could not encode: ${variableType.label}. Should never happen.`
      )
    }
  } else if (variableType.encoding === 'bytes') {
    // The Solidity compiler uses the "bytes" encoding for strings and dynamic bytes.
    // ref: https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
    if (storageObj.offset !== 0) {
      // Strings and dynamic bytes are *not* packed by Solidity.
      throw new Error(`got offset for string/bytes type, should never happen`)
    }

    // `string` types are converted to utf8 bytes, `bytes` are left as-is (assuming 0x prefixed).
    const bytes =
      variableType.label === 'string'
        ? ethers.utils.toUtf8Bytes(variable)
        : fromHexString(variable)

    if (bytes.length < 32) {
      // Solidity docs (see above) specifies that strings or bytes with a length of 31 bytes
      // should be placed into a storage slot where the last byte of the storage slot is the length
      // of the variable in bytes * 2.
      return [
        {
          key: slotKey,
          val: ethers.utils.hexlify(
            ethers.utils.concat([
              ethers.utils
                .concat([bytes, ethers.constants.HashZero])
                .slice(0, 31),
              ethers.BigNumber.from(bytes.length * 2).toHexString(),
            ])
          ),
        },
      ]
    } else {
      let slots = [
        {
          key: slotKey,
          val: padHexSlotValue((bytes.length * 2 + 1).toString(16), 0),
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
  } else if (variableType.encoding === 'mapping') {
    // Iterate over every key/value in the mapping to get the storage slot pair for each one.
    let slots: Array<StorageSlotPair> = []
    for (const [mappingKey, mappingVal] of Object.entries(variable)) {
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

      const mappingKeyStorageType = storageTypes[variableType.key]

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
          `unsupported mapping key encoding: ${mappingKeyStorageType.encoding}`
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
        label: '', // The mapping value has no storage label, which is fine since it's unused here.
        offset: storageObj.offset,
        slot: mappingValueStorageSlotKey,
        type: variableType.value,
      }

      // Encode the storage slot key/value for the mapping value. Note that we set
      // `nestedSlotOffset` to '0' because it isn't used when calculating the storage slot
      // key (we already calculated the storage slot key above).
      slots = slots.concat(
        encodeVariable(mappingVal, mappingValStorageObj, storageTypes, '0')
      )
    }
    return slots
  } else if (variableType.encoding === 'dynamic_array') {
    // For dynamic arrays, the current storage slot stores the number of elements in the array (byte
    // arrays and strings are an exception since they use the encoding 'bytes').
    let slots = [
      {
        key: slotKey,
        val: padHexSlotValue(variable.length.toString(16), 0),
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
        nestedSlotOffset
      )
    )
    return slots
  } else {
    // This error should never be triggered unless the Solidity compiler adds a new encoding type.
    throw new Error(
      `unknown unsupported type ${variableType.encoding} ${variableType.label}`
    )
  }
}

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
  array: any[],
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  elementSlotKey: string,
  nestedSlotOffset: string
): Array<StorageSlotPair> => {
  const elementType = storageTypes[storageObj.type].base

  if (elementType === undefined) {
    throw new Error(
      `Could not encode array elements for: ${storageObj.label}. Should never happen.`
    )
  }

  const bytesPerElement = Number(storageTypes[elementType].numberOfBytes)

  // Calculate the number of slots to increment when iterating over the array elements. This
  // number is only ever greater than one if `bytesPerElement` > 32, which could happen if the
  // array element type is large, e.g. a struct.
  const numSlotsToIncrement = Math.ceil(bytesPerElement / 32)

  // Arrays always start at a new storage slot with an offset of zero.
  let bytesOffset = 0

  // Iterate over the array and encode each element in it.
  let slots: Array<StorageSlotPair> = []
  for (const element of array) {
    slots = slots.concat(
      encodeVariable(
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
        nestedSlotOffset
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
 * TODO - Refactor long bytes/string encoding to instead use the encodeArrayElements and treat the
 * variable as a fixed size array of bytes1.
 *
 * @param array Bytes array to encode.
 * @param elementSlotKey The key of the slot where the beginning of the array is stored.
 * @returns Array encoded as a series of key/value slot pairs.
 */
export const encodeBytesArrayElements = (
  array: Uint8Array | Buffer,
  elementSlotKey: string
): Array<StorageSlotPair> => {
  // Iterate over the array and encode each element in it.
  const slots: Array<StorageSlotPair> = []
  for (let i = 0; i <= array.length; i += 32) {
    if (i + 32 <= array.length) {
      // beginning or middle chunk of the array
      slots.push({
        key: elementSlotKey,
        val: ethers.utils.hexlify(array.subarray(i, i + 32)),
      })

      elementSlotKey = addStorageSlotKeys(elementSlotKey, '1')
    } else {
      const arr = ethers.utils
        .concat([array, ethers.constants.HashZero])
        .slice(i, i + 32)
      // end chunk of the array
      slots.push({
        key: elementSlotKey,
        val: ethers.utils.hexlify(arr),
      })
    }
  }
  return slots
}

/**
 * Computes the key/value storage slot pairs that would be used if a given set of variable values
 * were applied to a given contract.
 *
 * @param storageLayout Solidity storage layout to use as a template for determining storage slots.
 * @param contractConfig Variable values to apply against the given storage layout.
 * @returns An array of key/value storage slot pairs that would result in the desired state.
 */
export const computeStorageSlots = (
  storageLayout: SolidityStorageLayout,
  contractConfig: ParsedContractConfig,
  immutableVariables: string[]
): Array<StorageSlotPair> => {
  const storageEntries: { [storageObjLabel: string]: SolidityStorageObj } = {}
  for (const storageObj of Object.values(storageLayout.storage)) {
    if (contractConfig.variables[storageObj.label] !== undefined) {
      storageEntries[storageObj.label] = storageObj
    } else {
      throw new Error(
        `Could not find variable "${storageObj.label}" in ${contractConfig.contract}.
Did you forget to declare it in your ChugSplash config file?`
      )
    }
  }

  let slots: StorageSlotPair[] = []
  for (const [variableName, variableValue] of Object.entries(
    contractConfig.variables
  )) {
    if (immutableVariables.includes(variableName)) {
      continue
    }

    // Find the entry in the storage layout that corresponds to this variable name.
    const storageObj = storageEntries[variableName]

    // Complain very loudly if attempting to set a variable that doesn't exist within this layout.
    if (!storageObj) {
      throw new Error(
        `variable "${variableName}" was defined in the ChugSplash config for ${contractConfig.contract}
but does not exist as a variable in the contract`
      )
    }

    // Encode this variable as series of storage slot key/value pairs and save it.
    slots = slots.concat(
      encodeVariable(variableValue, storageObj, storageLayout.types, '0')
    )
  }

  // Dealing with packed storage slots now. We know that a storage slot is packed when two storage
  // slots produced by the above encoding have the same key. In this case, we want to merge the two
  // values into a single bytes32 value. We'll throw an error if the two values overlap (have some
  // byte where both values are non-zero).
  slots = slots.reduce((prevSlots: Array<StorageSlotPair>, slot) => {
    // Find some previous slot where we have the same key.
    const prevSlot = prevSlots.find((otherSlot) => {
      return otherSlot.key === slot.key
    })

    if (prevSlot === undefined) {
      // Slot doesn't share a key with any other slot so we can just push it and continue.
      prevSlots.push(slot)
    } else {
      // Slot shares a key with some previous slot.
      // First, we remove the previous slot from the list of slots since we'll be modifying it.
      prevSlots = prevSlots.filter((otherSlot) => {
        return otherSlot.key !== prevSlot.key
      })

      // Now we'll generate a merged value by taking the non-zero bytes from both values. There's
      // probably a more efficient way to do this, but this is relatively easy and straightforward.
      let mergedVal = '0x'
      const valA = remove0x(slot.val)
      const valB = remove0x(prevSlot.val)
      for (let i = 0; i < 64; i += 2) {
        const byteA = valA.slice(i, i + 2)
        const byteB = valB.slice(i, i + 2)

        if (byteA === '00' && byteB === '00') {
          mergedVal += '00'
        } else if (byteA === '00' && byteB !== '00') {
          mergedVal += byteB
        } else if (byteA !== '00' && byteB === '00') {
          mergedVal += byteA
        } else {
          // Should never happen, means our encoding is broken. Values should *never* overlap.
          throw new Error(
            'detected badly encoded packed value, should not happen'
          )
        }
      }

      prevSlots.push({
        key: slot.key,
        val: mergedVal,
      })
    }

    return prevSlots
  }, [])

  return slots
}
