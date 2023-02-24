import * as fs from 'fs'

import { fromHexString, toHexString } from '@eth-optimism/core-utils'
import { ethers, providers } from 'ethers'
import MerkleTree from 'merkletreejs'

import { ParsedChugSplashConfig } from '../config/types'
import { Integration } from '../constants'
import { computeStorageSlots } from '../languages/solidity/storage'
import {
  ArtifactPaths,
  SolidityStorageLayout,
} from '../languages/solidity/types'
import {
  getImplAddress,
  readContractArtifact,
  getCreationCodeWithConstructorArgs,
} from '../utils'
import { readStorageLayout } from './artifacts'
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
    (action as SetStorageAction).value !== undefined &&
    (action as SetStorageAction).offset !== undefined
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
        ['bytes32', 'uint8', 'bytes'],
        [action.key, action.offset, action.value]
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
      data: action.extraData,
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
    const [key, offset, value] = ethers.utils.defaultAbiCoder.decode(
      ['bytes32', 'uint8', 'bytes'],
      rawAction.data
    )
    return {
      referenceName: rawAction.referenceName,
      key,
      offset,
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
      extraData: rawAction.data,
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
  provider: providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ChugSplashActionBundle> => {
  const artifacts = {}
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const storageLayout = readStorageLayout(
      artifactPaths[referenceName].buildInfoPath,
      contractConfig.contract
    )

    const { abi, bytecode } = readContractArtifact(
      artifactPaths[referenceName].contractArtifactPath,
      integration
    )
    const creationCodeWithConstructorArgs = getCreationCodeWithConstructorArgs(
      bytecode,
      contractConfig.constructorArgs,
      referenceName,
      abi
    )
    artifacts[referenceName] = {
      creationCodeWithConstructorArgs,
      storageLayout,
    }
  }

  return makeActionBundleFromConfig(provider, parsedConfig, artifacts)
}

/**
 * Generates a ChugSplash action bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Action bundle generated from the parsed config file.
 */
export const makeActionBundleFromConfig = async (
  provider: providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  artifacts: {
    [name: string]: {
      creationCodeWithConstructorArgs: string
      storageLayout: SolidityStorageLayout
    }
  }
): Promise<ChugSplashActionBundle> => {
  const actions: ChugSplashAction[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { storageLayout, creationCodeWithConstructorArgs } =
      artifacts[referenceName]

    // Skip adding a `DEPLOY_IMPLEMENTATION` action if the implementation has already been deployed.
    if (
      (await provider.getCode(
        getImplAddress(
          parsedConfig.options.projectName,
          referenceName,
          creationCodeWithConstructorArgs
        )
      )) === '0x'
    ) {
      if (referenceName === 'RootChugSplashManager') {
        fs.writeFileSync('deploy.md', creationCodeWithConstructorArgs)
      }
      // Add a DEPLOY_IMPLEMENTATION action.
      actions.push({
        referenceName,
        code: creationCodeWithConstructorArgs,
      })
    }

    // Next, add a SET_IMPLEMENTATION action for each contract.
    if (contractConfig.proxyType === 'internal-registry') {
      // If the proxy's type is `internal-registry`, we will add the ChugSplashManager's implementation
      // address as `extraData`. This logic will be removed when ChugSplash is non-upgradeable.
      const managerCreationCodeWithArgs =
        artifacts['RootChugSplashManager'].creationCodeWithConstructorArgs
      if (!managerCreationCodeWithArgs) {
        throw new Error(
          'Could not find ChugSplashManager creation code from the ChugSplash file.'
        )
      }
      const managerImplAddress = getImplAddress(
        parsedConfig.options.projectName,
        'RootChugSplashManager',
        managerCreationCodeWithArgs
      )
      actions.push({
        referenceName,
        extraData: managerImplAddress,
      })
    } else {
      actions.push({
        referenceName,
        extraData: '0x',
      })
    }

    // Compute our storage slots.
    // TODO: One day we'll need to refactor this to support Vyper.
    const slots = computeStorageSlots(storageLayout, contractConfig)

    // Add SET_STORAGE actions for each storage slot that we want to modify.
    for (const slot of slots) {
      actions.push({
        referenceName,
        key: slot.key,
        offset: slot.offset,
        value: slot.val,
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromActions(actions)
}
