import { fromHexString, remove0x } from '@eth-optimism/core-utils'
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
const padHexSlotValue = (val: string, offset: number): string => {
  return (
    '0x' +
    remove0x(val)
      .padStart(64 - offset * 2, '0') // Pad the start with 64 - offset zero bytes.
      .padEnd(64, '0') // Pad the end (up to 64 bytes) with zero bytes.
      .toLowerCase() // Making this lower case makes assertions more consistent later.
  )
}

const getOffsetPerElement = (varLabel: string): number => {
  const elementType = varLabel.split('[')[0]
  if (elementType.startsWith('bool')) {
    return 1
  } else if (
    elementType.startsWith('address') ||
    elementType.startsWith('contract')
  ) {
    return 20
  } else if (elementType.startsWith('uint')) {
    const bits = Number(elementType.substring(4))
    return bits / 8
  } else if (elementType.startsWith('int')) {
    const bits = Number(elementType.substring(3))
    return bits / 8
  } else if (elementType.startsWith('string')) {
    return 32
  }
}

/**
 * Encodes a single variable as a series of key/value storage slot pairs using some storage layout
 * as instructions for how to perform this encoding. Works recursively with struct types.
 * ref: https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
 *
 * @param variable Variable to encode as key/value slot pairs.
 * @param storageObj Solidity compiler JSON output describing the layout for this
 * @param storageTypes Full list of storage types allowed for this encoding.
 * @param nestedSlotOffset For nested data structures, keeps track of a value to be added onto the
 * keys for nested values.
 * @returns Variable encoded as a series of key/value slot pairs.
 */
const encodeVariable = (
  variable: any,
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  nestedSlotOffset = 0,
  // Slot key will be the same unless we are storing a mapping.
  // So default to calculating it here, unless one is passed in.
  slotKey = '0x' +
    remove0x(
      BigNumber.from(
        parseInt(storageObj.slot as any, 10) + nestedSlotOffset
      ).toHexString()
    ).padStart(64, '0'),
  mappingType: string | undefined = undefined
): Array<StorageSlotPair> => {
  const variableType = storageTypes[mappingType ?? storageObj.type]

  if (variableType.encoding === 'inplace') {
    if (storageObj.type.startsWith('t_array')) {
      if (variableType.base.startsWith('t_array')) {
        throw new Error(`nested arrays are not supported yet`)
      }
      const offsetPerElement = getOffsetPerElement(variableType.label)
      let { offset } = storageObj
      let slot = parseInt(storageObj.slot, 10)
      let slots = []
      for (const element of variable) {
        slots = slots.concat(
          encodeVariable(
            element,
            {
              astId: 0,
              contract: storageObj.contract,
              label: storageObj.label,
              offset,
              slot: slot.toString(),
              type: variableType.base,
            },
            storageTypes,
            nestedSlotOffset
          )
        )
        offset += offsetPerElement
        if (offset + offsetPerElement > 32) {
          slot += 1
          offset = 0
        }
      }
      return slots
    } else if (
      variableType.label.startsWith('address') ||
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
      variableType.label.startsWith('enum')
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
      let slots = []
      for (const [varName, varVal] of Object.entries(variable)) {
        const currMember = variableType.members.find((member) => {
          return member.label === varName
        })
        if (currMember === undefined) {
          throw new Error(
            `incorrect member in ${variableType.label}: ${varName}`
          )
        }
        // if this struct is within a mapping, then the key must be calculated
        // using the passed in slotkey
        const offsetKey = BigNumber.from(slotKey)
          .add(parseInt(currMember.slot as any, 10))
          .toHexString()
        slots = slots.concat(
          encodeVariable(
            varVal,
            currMember,
            storageTypes,
            nestedSlotOffset + parseInt(storageObj.slot as any, 10),
            mappingType ? offsetKey : undefined
          )
        )
      }
      return slots
    }
  } else if (variableType.encoding === 'bytes') {
    if (storageObj.offset !== 0) {
      // string/bytes types are *not* packed by Solidity.
      throw new Error(`got offset for string/bytes type, should never happen`)
    }

    // `string` types are converted to utf8 bytes, `bytes` are left as-is (assuming 0x prefixed).
    const bytes =
      variableType.label === 'string'
        ? ethers.utils.toUtf8Bytes(variable)
        : fromHexString(variable)

    // ref: https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
    if (bytes.length < 32) {
      // NOTE: Solidity docs (see above) specifies that strings or bytes with a length of 31 bytes
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
      throw new Error('large strings (>31 bytes) not supported')
    }
  } else if (variableType.encoding === 'mapping') {
    let slots = []
    for (const [key, value] of Object.entries(variable)) {
      // default pack type for value types
      let type = variableType.key.split('_')[1]
      // default key encoding for value types
      let encodedKey: string | Uint8Array = encodeVariable(
        key,
        storageObj,
        storageTypes,
        nestedSlotOffset + parseInt(storageObj.slot as any, 10),
        undefined,
        variableType.key
      )[0].val

      if (variableType.key.startsWith('t_uint')) {
        // all uints must be packed with type uint256
        type = 'uint256'
      } else if (variableType.key.startsWith('t_int')) {
        // all ints must be packed with type int256
        type = 'int256'
      } else if (variableType.key.startsWith('t_string')) {
        // strings do not need to be encoded
        // pack type can be pulled from input type
        encodedKey = key
      } else if (variableType.key.startsWith('t_bytes')) {
        // bytes do not need to be encoded, but must be converted from the input string
        // pack type can be pulled straight from input type
        encodedKey = fromHexString(key)
      }

      // key for nested mappings is computed by packing and hashing the key of the child mapping
      let concatenated
      if (mappingType) {
        concatenated = ethers.utils.solidityPack(
          [type, 'uint256'],
          [encodedKey, slotKey]
        )
      } else {
        concatenated = ethers.utils.solidityPack(
          [type, 'uint256'],
          [encodedKey, BigNumber.from(storageObj.slot).toHexString()]
        )
      }

      const mappingKey = utils.keccak256(concatenated)

      slots = slots.concat(
        encodeVariable(
          value,
          storageObj,
          storageTypes,
          0,
          mappingKey,
          variableType.value
        )
      )
    }
    return slots
  } else if (variableType.encoding === 'dynamic_array') {
    throw new Error('array types not yet supported')
  } else {
    throw new Error(
      `unknown unsupported type ${variableType.encoding} ${variableType.label}`
    )
  }
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
  const storageEntries = {}
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
      encodeVariable(variableValue, storageObj, storageLayout.types)
    )
  }

  // Dealing with packed storage slots now. We know that a storage slot is packed when two storage
  // slots produced by the above encoding have the same key. In this case, we want to merge the two
  // values into a single bytes32 value. We'll throw an error if the two values overlap (have some
  // byte where both values are non-zero).
  slots = slots.reduce((prevSlots, slot) => {
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
