import { fromHexString, toHexString } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import MerkleTree from 'merkletreejs'

import { makeActionBundleFromConfig, ParsedChugSplashConfig } from '../config'
import { Integration } from '../constants'
import { ArtifactPaths } from '../languages'
import {
  readContractArtifact,
  readStorageLayout,
  getCreationCodeWithConstructorArgs,
  getImmutableVariables,
  readBuildInfo,
} from './artifacts'
import {
  ChugSplashAction,
  ChugSplashActionBundle,
  ChugSplashActionType,
  DeployImplementationAction,
  RawChugSplashAction,
  SetImplementationAction,
  SetStorageAction,
} from './types'

/**
 * Checks whether a given action is a SetStorage action.
 *
 * @param action ChugSplash action to check.
 * @return `true` if the action is a SetStorage action, `false` otherwise.
 */
export const isSetStorageAction = (
  action: ChugSplashAction
): action is SetStorageAction => {
  return (
    (action as SetStorageAction).key !== undefined &&
    (action as SetStorageAction).value !== undefined
  )
}

/**
 * Checks whether a given action is a SetImplementation action.
 *
 * @param action ChugSplash action to check.
 * @returns `true` if the action is a SetImplementation action, `false` otherwise.
 */
export const isSetImplementationAction = (
  action: ChugSplashAction
): action is SetImplementationAction => {
  return !isSetStorageAction(action) && !isDeployImplementationAction(action)
}

/**
 * Checks whether a given action is a DeployImplementation action.
 *
 * @param action ChugSplash action to check.
 * @returns `true` if the action is a DeployImplementation action, `false` otherwise.
 */
export const isDeployImplementationAction = (
  action: ChugSplashAction
): action is DeployImplementationAction => {
  return (action as DeployImplementationAction).code !== undefined
}

/**
 * Converts the "nice" action structs into a "raw" action struct (better for Solidity but
 * worse for users here).
 *
 * @param action ChugSplash action to convert.
 * @return Converted "raw" ChugSplash action.
 */
export const toRawChugSplashAction = (
  action: ChugSplashAction
): RawChugSplashAction => {
  if (isSetStorageAction(action)) {
    return {
      actionType: ChugSplashActionType.SET_STORAGE,
      referenceName: action.referenceName,
      data: ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32'],
        [action.key, action.value]
      ),
    }
  } else if (isDeployImplementationAction(action)) {
    return {
      actionType: ChugSplashActionType.DEPLOY_IMPLEMENTATION,
      referenceName: action.referenceName,
      data: action.code,
    }
  } else {
    return {
      actionType: ChugSplashActionType.SET_IMPLEMENTATION,
      referenceName: action.referenceName,
      data: '0x',
    }
  }
}

/**
 * Converts a raw ChugSplash action into a "nice" action struct.
 *
 * @param rawAction Raw ChugSplash action to convert.
 * @returns Converted "nice" ChugSplash action.
 */
export const fromRawChugSplashAction = (
  rawAction: RawChugSplashAction
): ChugSplashAction => {
  if (rawAction.actionType === ChugSplashActionType.SET_STORAGE) {
    const [key, value] = ethers.utils.defaultAbiCoder.decode(
      ['bytes32', 'bytes32'],
      rawAction.data
    )
    return {
      referenceName: rawAction.referenceName,
      key,
      value,
    }
  } else if (
    rawAction.actionType === ChugSplashActionType.DEPLOY_IMPLEMENTATION
  ) {
    return {
      referenceName: rawAction.referenceName,
      code: rawAction.data,
    }
  } else {
    return {
      referenceName: rawAction.referenceName,
    }
  }
}

/**
 * Computes the hash of an action.
 *
 * @param action Action to compute the hash of.
 * @return Hash of the action.
 */
export const getActionHash = (action: RawChugSplashAction): string => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['string', 'uint8', 'bytes'],
      [action.referenceName, action.actionType, action.data]
    )
  )
}

/**
 * Generates an action bundle from a set of actions. Effectively encodes the inputs that will be
 * provided to the ChugSplashManager contract. This function also sorts the actions so that the
 * SetStorage actions are first, the DeployImplementation actions are second, and the
 * SetImplementation actions are last.
 *
 * @param actions Series of SetImplementation, DeployImplementation, or SetStorage actions to
 * bundle.
 * @return Bundled actions.
 */
export const makeBundleFromActions = (
  actions: ChugSplashAction[]
): ChugSplashActionBundle => {
  // Sort the actions to be in the order: SetStorage, DeployImplementation,
  // SetImplementation.
  const sortedActions = actions.sort((a1, a2) => {
    if (isSetStorageAction(a1) || isSetImplementationAction(a2)) {
      // Keep the order of the actions if the first action is SetStorage or if the second action is
      // SetImplementation.
      return -1
    } else if (isSetImplementationAction(a1) || isSetStorageAction(a2)) {
      // Swap the order of the actions if the first action is SetImplementation or the second
      // action is SetStorage.
      return 1
    }
    // Keep the same order otherwise.
    return 0
  })

  // Turn the "nice" action structs into raw actions.
  const rawActions = sortedActions.map((action) => {
    return toRawChugSplashAction(action)
  })

  // Now compute the hash for each action.
  const elements = rawActions.map((action) => {
    return getActionHash(action)
  })

  // Pad the list of elements out with default hashes if len < a power of 2.
  const filledElements: string[] = []
  for (let i = 0; i < Math.pow(2, Math.ceil(Math.log2(elements.length))); i++) {
    if (i < elements.length) {
      filledElements.push(elements[i])
    } else {
      filledElements.push(ethers.utils.keccak256(ethers.constants.HashZero))
    }
  }

  // merkletreejs expects things to be buffers.
  const tree = new MerkleTree(
    filledElements.map((element) => {
      return fromHexString(element)
    }),
    (el: Buffer | string): Buffer => {
      return fromHexString(ethers.utils.keccak256(el))
    }
  )

  return {
    root: toHexString(tree.getRoot()),
    actions: rawActions.map((action, idx) => {
      return {
        action,
        proof: {
          actionIndex: idx,
          siblings: tree.getProof(getActionHash(action), idx).map((element) => {
            return element.data
          }),
        },
      }
    }),
  }
}

export const bundleLocal = async (
  parsedConfig: ParsedChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ChugSplashActionBundle> => {
  const artifacts = {}
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const storageLayout = readStorageLayout(
      contractConfig.contract,
      artifactPaths,
      integration
    )

    const { abi, sourceName, contractName, bytecode } = readContractArtifact(
      artifactPaths,
      contractConfig.contract,
      integration
    )
    const { output: compilerOutput } = readBuildInfo(
      artifactPaths,
      contractConfig.contract
    )
    const creationCode = getCreationCodeWithConstructorArgs(
      bytecode,
      parsedConfig,
      referenceName,
      abi,
      compilerOutput,
      sourceName,
      contractName
    )
    const immutableVariables = getImmutableVariables(
      compilerOutput,
      sourceName,
      contractName,
      parsedConfig.contracts[referenceName]
    )
    artifacts[referenceName] = {
      creationCode,
      storageLayout,
      immutableVariables,
    }
  }

  return makeActionBundleFromConfig(parsedConfig, artifacts)
}
