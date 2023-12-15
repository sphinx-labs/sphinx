import { AbiCoder, ethers } from 'ethers'

import {
  DecodedApproveLeafData,
  DecodedExecuteLeafData,
  FoundryContractArtifact,
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
 * Retrieves artifact info from foundry artifacts and returns it in hardhat compatible format.
 *
 * @param artifact Raw artifact object.
 * @returns FoundryContractArtifact
 */
export const parseFoundryArtifact = (
  artifact: any
): FoundryContractArtifact => {
  const abi = artifact.abi
  const bytecode = add0x(artifact.bytecode.object)
  const deployedBytecode = add0x(artifact.deployedBytecode.object)

  const compilationTarget = artifact.metadata.settings.compilationTarget
  const sourceName = Object.keys(compilationTarget)[0]
  const contractName = compilationTarget[sourceName]
  const metadata = artifact.metadata
  const storageLayout = artifact.storageLayout ?? { storage: [], types: {} }

  return {
    abi,
    bytecode,
    sourceName,
    contractName,
    deployedBytecode,
    metadata,
    methodIdentifiers: artifact.methodIdentifiers,
    storageLayout,
  }
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
    const value = values[i]
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
          return e
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
