import { fromHexString, toHexString } from '@eth-optimism/core-utils'
import { ethers, providers } from 'ethers'
import MerkleTree from 'merkletreejs'
import { astDereferencer } from 'solidity-ast/utils'

import {
  CanonicalConfigArtifacts,
  ParsedChugSplashConfig,
  proxyTypeHashes,
} from '../config/types'
import { Integration } from '../constants'
import {
  computeStorageSegments,
  extendStorageLayout,
} from '../languages/solidity/storage'
import { ArtifactPaths } from '../languages/solidity/types'
import {
  getImplAddress,
  readContractArtifact,
  getCreationCodeWithConstructorArgs,
  readBuildInfo,
} from '../utils'
import {
  ChugSplashAction,
  ChugSplashActionBundle,
  ChugSplashActionType,
  ChugSplashBundles,
  ChugSplashTarget,
  ChugSplashTargetBundle,
  DeployImplementationAction,
  RawChugSplashAction,
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
      proxy: action.proxy,
      proxyTypeHash: action.proxyTypeHash,
      referenceName: action.referenceName,
      data: ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'uint8', 'bytes'],
        [action.key, action.offset, action.value]
      ),
    }
  } else if (isDeployImplementationAction(action)) {
    return {
      actionType: ChugSplashActionType.DEPLOY_IMPLEMENTATION,
      proxy: action.proxy,
      proxyTypeHash: action.proxyTypeHash,
      referenceName: action.referenceName,
      data: action.code,
    }
  } else {
    throw new Error(`unknown action type`)
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
      proxy: rawAction.proxy,
      proxyTypeHash: rawAction.proxyTypeHash,
      key,
      offset,
      value,
    }
  } else if (
    rawAction.actionType === ChugSplashActionType.DEPLOY_IMPLEMENTATION
  ) {
    return {
      referenceName: rawAction.referenceName,
      proxy: rawAction.proxy,
      proxyTypeHash: rawAction.proxyTypeHash,
      code: rawAction.data,
    }
  } else {
    throw new Error(`unknown action type`)
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
      ['string', 'address', 'uint8', 'bytes32', 'bytes'],
      [
        action.referenceName,
        action.proxy,
        action.actionType,
        action.proxyTypeHash,
        action.data,
      ]
    )
  )
}

/**
 * Computes the hash of a target.
 *
 * @param target Target to compute the hash of.
 * @return Hash of the action.
 */
export const getTargetHash = (target: ChugSplashTarget): string => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['string', 'string', 'address', 'address', 'bytes32'],
      [
        target.projectName,
        target.referenceName,
        target.proxy,
        target.implementation,
        target.proxyTypeHash,
      ]
    )
  )
}

export const makeBundleFromTargets = (
  targets: ChugSplashTarget[]
): ChugSplashTargetBundle => {
  // Now compute the hash for each action.
  const elements = targets.map((target) => {
    return getTargetHash(target)
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
    targets: targets.map((target, idx) => {
      return {
        target,
        siblings: tree.getProof(getTargetHash(target), idx).map((element) => {
          return element.data
        }),
      }
    }),
  }
}

/**
 * Generates an action bundle from a set of actions. Effectively encodes the inputs that will be
 * provided to the ChugSplashManager contract. This function also sorts the actions so that the
 * SetStorage actions are first and the DeployImplementation actions are last.
 *
 * @param actions Series of DeployImplementation and SetStorage actions to bundle.
 * @return Bundled actions.
 */
export const makeBundleFromActions = (
  actions: ChugSplashAction[]
): ChugSplashActionBundle => {
  // Sort the actions to be in the order: SetStorage then DeployImplementation
  const sortedActions = actions.sort((a1, a2) => {
    if (isSetStorageAction(a1)) {
      // Keep the order of the actions if the first action is SetStorage.
      return -1
    } else if (isSetStorageAction(a2)) {
      // Swap the order of the actions if the second action is SetStorage.
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
): Promise<ChugSplashBundles> => {
  const artifacts: CanonicalConfigArtifacts = {}
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { input, output } = readBuildInfo(
      artifactPaths[referenceName].buildInfoPath
    )

    const { abi, bytecode, sourceName, contractName } = readContractArtifact(
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
      compilerInput: input,
      compilerOutput: output,
      creationCodeWithConstructorArgs,
      abi,
      sourceName,
      contractName,
    }
  }

  return makeBundlesFromConfig(provider, parsedConfig, artifacts)
}

export const makeBundlesFromConfig = async (
  provider: providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  artifacts: CanonicalConfigArtifacts
): Promise<ChugSplashBundles> => {
  const actionBundle = await makeActionBundleFromConfig(
    provider,
    parsedConfig,
    artifacts
  )
  const targetBundle = makeTargetBundleFromConfig(parsedConfig, artifacts)
  return { actionBundle, targetBundle }
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
  artifacts: CanonicalConfigArtifacts
): Promise<ChugSplashActionBundle> => {
  const actions: ChugSplashAction[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const {
      creationCodeWithConstructorArgs,
      compilerOutput,
      sourceName,
      contractName,
    } = artifacts[referenceName]

    const storageLayout =
      compilerOutput.contracts[sourceName][contractName].storageLayout

    // Skip adding a `DEPLOY_IMPLEMENTATION` action if the implementation has already been deployed.
    if (
      (await provider.getCode(
        getImplAddress(
          parsedConfig.options.organizationID,
          referenceName,
          creationCodeWithConstructorArgs
        )
      )) === '0x'
    ) {
      // Add a DEPLOY_IMPLEMENTATION action.
      actions.push({
        referenceName,
        proxy: contractConfig.proxy,
        proxyTypeHash: proxyTypeHashes[contractConfig.proxyType],
        code: creationCodeWithConstructorArgs,
      })
    }

    // Create an AST Dereferencer. We must convert the CompilerOutput type to `any` here because
    // because a type error will be thrown otherwise. Coverting to `any` is harmless because we use
    // Hardhat's default `CompilerOutput`, which is what OpenZeppelin expects.
    const dereferencer = astDereferencer(compilerOutput as any)

    const extendedLayout = extendStorageLayout(storageLayout, dereferencer)

    // Compute our storage segments.
    // TODO: One day we'll need to refactor this to support Vyper.
    const segments = computeStorageSegments(
      extendedLayout,
      contractConfig,
      dereferencer
    )

    // Add SET_STORAGE actions for each storage slot that we want to modify.
    for (const segment of segments) {
      actions.push({
        referenceName,
        proxy: contractConfig.proxy,
        proxyTypeHash: proxyTypeHashes[contractConfig.proxyType],
        key: segment.key,
        offset: segment.offset,
        value: segment.val,
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromActions(actions)
}

/**
 * Generates a ChugSplash target bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Target bundle generated from the parsed config file.
 */
export const makeTargetBundleFromConfig = (
  parsedConfig: ParsedChugSplashConfig,
  artifacts: CanonicalConfigArtifacts
): ChugSplashTargetBundle => {
  const projectName = parsedConfig.options.projectName

  const targets: ChugSplashTarget[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { creationCodeWithConstructorArgs } = artifacts[referenceName]

    targets.push({
      projectName,
      referenceName,
      proxyTypeHash: proxyTypeHashes[contractConfig.proxyType],
      proxy: contractConfig.proxy,
      implementation: getImplAddress(
        parsedConfig.options.organizationID,
        referenceName,
        creationCodeWithConstructorArgs
      ),
    })
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromTargets(targets)
}
