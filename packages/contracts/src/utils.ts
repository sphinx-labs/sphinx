import { AbiCoder, ethers } from 'ethers'

import {
  DecodedApproveLeafData,
  DecodedExecuteLeafData,
  ContractArtifact,
  LinkReferences,
} from './types'
import { SphinxLeaf } from './merkle-tree'

export const decodeApproveLeafData = (
  leaf: SphinxLeaf
): DecodedApproveLeafData => {
  const [
    safeProxy,
    moduleProxy,
    merkleRootNonce,
    numLeaves,
    executor,
    uri,
    arbitraryChain,
  ] = AbiCoder.defaultAbiCoder().decode(
    ['address', 'address', 'uint', 'uint', 'address', 'string', 'bool'],
    leaf.data
  )

  return {
    safeProxy,
    moduleProxy,
    merkleRootNonce,
    numLeaves,
    executor,
    uri,
    arbitraryChain,
  }
}

export const decodeExecuteLeafData = (
  leaf: SphinxLeaf
): DecodedExecuteLeafData => {
  const [to, value, gas, txData, operation, requireSuccess] =
    AbiCoder.defaultAbiCoder().decode(
      ['address', 'uint', 'uint', 'bytes', 'uint', 'bool'],
      leaf.data
    )

  return {
    to,
    value,
    gas,
    txData,
    operation,
    requireSuccess,
  }
}

/**
 * Converts a Foundry contract artifact to an artifact with a standard format.
 *
 * @param foundryArtifact Foundry artifact object.
 */
export const parseFoundryContractArtifact = (
  foundryArtifact: any
): ContractArtifact => {
  const abi = foundryArtifact.abi
  const bytecode = add0x(foundryArtifact.bytecode.object)
  const deployedBytecode = add0x(foundryArtifact.deployedBytecode.object)

  const compilationTarget = foundryArtifact.metadata.settings.compilationTarget
  const sourceName = Object.keys(compilationTarget)[0]
  const contractName = compilationTarget[sourceName]
  const metadata = foundryArtifact.metadata

  const artifact: ContractArtifact = {
    abi,
    bytecode,
    sourceName,
    contractName,
    deployedBytecode,
    metadata,
    methodIdentifiers: foundryArtifact.methodIdentifiers,
    storageLayout: foundryArtifact.storageLayout,
    linkReferences: foundryArtifact.bytecode.linkReferences,
    deployedLinkReferences: foundryArtifact.deployedBytecode.linkReferences,
  }

  if (!isContractArtifact(artifact)) {
    throw new Error(`Could not parse Foundry contract artifact.`)
  }

  return artifact
}

export const isContractArtifact = (obj: any): obj is ContractArtifact => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    Array.isArray(obj.abi) &&
    typeof obj.sourceName === 'string' &&
    typeof obj.contractName === 'string' &&
    typeof obj.bytecode === 'string' &&
    typeof obj.deployedBytecode === 'string' &&
    isLinkReferences(obj.linkReferences) &&
    isLinkReferences(obj.deployedLinkReferences) &&
    isNonNullObject(obj.metadata) &&
    (obj.storageLayout === undefined ||
      isValidStorageLayout(obj.storageLayout)) &&
    (isNonNullObject(obj.methodIdentifiers) ||
      obj.methodIdentifiers === undefined)
  )
}

/**
 * Removes "0x" from start of a string if it exists.
 *
 * @param str String to modify.
 * @returns the string without "0x".
 */
export const remove0x = (str: string): string => {
  if (str === undefined) {
    return str
  }
  return str.startsWith('0x') ? str.slice(2) : str
}

/**
 * Adds "0x" to the start of a string if necessary.
 *
 * @param str String to modify.
 * @returns the string with "0x".
 */
export const add0x = (str: string): string => {
  if (str === undefined) {
    return str
  }
  return str.startsWith('0x') ? str : '0x' + str
}

/**
 * @notice This function recursively converts an `ethers.Result` into a plain object. We do this
 * because `ethers.Result`s are essentially arrays, which makes it difficult to work with them
 * because we can't access the fields by name. Converting these into objects also allows us to
 * display function arguments in a more readable format in the deployment preview.
 *
 * If the `Result` contains any unnamed variables, then the returned value will be an array instead
 * of an object. For example, if `values = [1, true]`, then the returned value will also be `[1,
 * true]`. However, if one of the elements is a complex data type, like a struct, then it will
 * convert its fields into an object. For example, if `value = [1, true, [2, 3]]`, where `[2, 3]`
 * are the fields of a struct, then the result would look something like: `[1, true, { myField: 2,
 * myOtherField: 3}]`.
 *
 * @param types The types of the variables in the `Result`. This can be retrieved from an
 * `ethers.Interface` object.
 * @param values The `Result` to convert.
 *
 * @returns The converted result. The returned object/array will not contain strings instead of
 * BigInt values to ensure that `JSON.stringify` and `JSON.parse` can be called on it without
 * causing an error.
 */
export const recursivelyConvertResult = (
  types: readonly ethers.ParamType[],
  values: ethers.Result
): unknown => {
  const containsUnnamedValue = types.some((t) => t.name === '')

  // If the `Result` contains any unnamed variables, then we return an array. Otherwise, we return
  // an object.
  const converted: Array<any> | { [key: string]: any } = containsUnnamedValue
    ? []
    : {}

  for (let i = 0; i < types.length; i++) {
    const paramType = types[i]
    const value =
      typeof values[i] === 'bigint' ? values[i].toString() : values[i]
    // Structs are represented as tuples.
    if (paramType.isTuple()) {
      const convertedTuple = recursivelyConvertResult(
        paramType.components,
        value
      )
      // Add the converted tuple to the array or object.
      if (containsUnnamedValue) {
        converted.push(convertedTuple)
      } else {
        converted[paramType.name] = convertedTuple
      }
    } else if (paramType.isArray()) {
      // Recursively convert the elements of the array.
      const convertedElements = value.map((e) => {
        if (paramType.arrayChildren.isTuple()) {
          const elementResult = ethers.Result.fromItems(e)
          return recursivelyConvertResult(
            paramType.arrayChildren.components,
            elementResult
          )
        } else if (paramType.arrayChildren.isArray()) {
          // The element is itself an array.
          const elementResult = ethers.Result.fromItems(e)
          return recursivelyConvertResult(
            // Create an array of `ParamType` objects of the same length as the element array.
            Array(e.length).fill(paramType.arrayChildren.arrayChildren),
            elementResult
          )
        } else {
          return typeof e === 'bigint' ? e.toString() : e
        }
      })
      if (containsUnnamedValue) {
        converted.push(convertedElements)
      } else {
        converted[paramType.name] = convertedElements
      }
    } else if (containsUnnamedValue) {
      converted.push(value)
    } else {
      converted[paramType.name] = value
    }
  }
  return converted
}

export const isLinkReferences = (obj: any): obj is LinkReferences => {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }

  return Object.values(obj).every((libraryFileNameObj) => {
    if (typeof libraryFileNameObj !== 'object' || libraryFileNameObj === null) {
      return false
    }

    return Object.values(libraryFileNameObj).every(
      (library) =>
        Array.isArray(library) &&
        library.every(
          (ref) =>
            ref !== null &&
            typeof ref === 'object' &&
            typeof ref.length === 'number' &&
            typeof ref.start === 'number'
        )
    )
  })
}

const isValidStorageLayout = (storageLayout: any): boolean => {
  return (
    storageLayout !== null &&
    typeof storageLayout === 'object' &&
    Array.isArray(storageLayout.storage) &&
    typeof storageLayout.types === 'object'
  )
}

export const isNonNullObject = (obj: any): boolean => {
  return typeof obj === 'object' && obj !== null
}
