import { fromHexString, toHexString } from '@eth-optimism/core-utils'
import { ethers, providers } from 'ethers'
import MerkleTree from 'merkletreejs'
import { astDereferencer } from 'solidity-ast/utils'

import {
  CanonicalConfigArtifacts,
  ParsedChugSplashConfig,
  contractKindHashes,
} from '../config/types'
import { Integration } from '../constants'
import {
  computeStorageSegments,
  extendStorageLayout,
} from '../languages/solidity/storage'
import { ArtifactPaths } from '../languages/solidity/types'
import {
  getContractAddress,
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
  DeployContractAction,
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
 * Checks whether a given action is a DeployContract action.
 *
 * @param action ChugSplash action to check.
 * @returns `true` if the action is a DeployContract action, `false` otherwise.
 */
export const isDeployContractAction = (
  action: ChugSplashAction
): action is DeployContractAction => {
  return (action as DeployContractAction).code !== undefined
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
      contractKindHash: action.contractKindHash,
      referenceName: action.referenceName,
      data: ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'uint8', 'bytes'],
        [action.key, action.offset, action.value]
      ),
    }
  } else if (isDeployContractAction(action)) {
    return {
      actionType: ChugSplashActionType.DEPLOY_CONTRACT,
      proxy: action.proxy,
      contractKindHash: action.contractKindHash,
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
      contractKindHash: rawAction.contractKindHash,
      key,
      offset,
      value,
    }
  } else if (rawAction.actionType === ChugSplashActionType.DEPLOY_CONTRACT) {
    return {
      referenceName: rawAction.referenceName,
      proxy: rawAction.proxy,
      contractKindHash: rawAction.contractKindHash,
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
        action.contractKindHash,
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
      ['string', 'address', 'address', 'bytes32'],
      [
        target.referenceName,
        target.proxy,
        target.implementation,
        target.contractKindHash,
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
 * SetStorage actions are first and the DeployContract actions are last.
 *
 * @param actions Series of DeployContract and SetStorage actions to bundle.
 * @return Bundled actions.
 */
export const makeBundleFromActions = (
  actions: ChugSplashAction[]
): ChugSplashActionBundle => {
  // Sort the actions to be in the order: SetStorage then DeployContract
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
      bytecode,
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

    // Foundry outputs no storage layout for contracts that don't have any storage variables, so we fill it in with the empty layout.
    const storageLayout = compilerOutput.contracts[sourceName][contractName]
      .storageLayout ?? { storage: [], types: {} }

    // Skip adding a `DEPLOY_CONTRACT` action if the contract has already been deployed.
    if (
      (await provider.getCode(
        getContractAddress(
          parsedConfig.options.projectName,
          referenceName,
          contractConfig.constructorArgs,
          artifacts[referenceName]
        )
      )) === '0x'
    ) {
      // Add a DEPLOY_CONTRACT action.
      actions.push({
        referenceName,
        proxy: contractConfig.proxy,
        contractKindHash: contractKindHashes[contractConfig.kind],
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
        contractKindHash: contractKindHashes[contractConfig.kind],
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
  const targets: ChugSplashTarget[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    targets.push({
      referenceName,
      contractKindHash: contractKindHashes[contractConfig.kind],
      proxy: contractConfig.proxy,
      implementation: getContractAddress(
        parsedConfig.options.projectName,
        referenceName,
        contractConfig.constructorArgs,
        artifacts[referenceName]
      ),
    })
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromTargets(targets)
}
