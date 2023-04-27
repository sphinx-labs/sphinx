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
import {
  ArtifactPaths,
  BuildInfo,
  ContractArtifact,
} from '../languages/solidity/types'
import {
  getContractAddress,
  readContractArtifact,
  getCreationCodeWithConstructorArgs,
  readBuildInfo,
  getChugSplashManagerAddress,
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
import { getStorageLayout } from './artifacts'

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
      ['string', 'string', 'address', 'address', 'bytes32'],
      [
        target.projectName,
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
  // Compute the hash for each action.
  const elements = targets.map((target) => {
    return getTargetHash(target)
  })

  const tree = makeMerkleTree(elements)

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
 * provided to the ChugSplashManager contract.
 *
 * @param actions Series of DeployContract and SetStorage actions to bundle.
 * @return Bundled actions.
 */
export const makeBundleFromActions = (
  actions: ChugSplashAction[]
): ChugSplashActionBundle => {
  // Turn the "nice" action structs into raw actions.
  const rawActions = actions.map((action) => {
    return toRawChugSplashAction(action)
  })

  // Now compute the hash for each action.
  const elements = rawActions.map((action) => {
    return getActionHash(action)
  })

  const tree = makeMerkleTree(elements)

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

export const makeMerkleTree = (elements: string[]): MerkleTree => {
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
  return new MerkleTree(
    filledElements.map((element) => {
      return fromHexString(element)
    }),
    (el: Buffer | string): Buffer => {
      return fromHexString(ethers.utils.keccak256(el))
    }
  )
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
  artifacts: ConfigArtifacts
): Promise<ChugSplashBundles> => {
  const actionBundle = await makeActionBundleFromConfig(
    provider,
    parsedConfig,
    artifacts
  )
  const targetBundle = makeTargetBundleFromConfig(parsedConfig, artifacts)
  return { actionBundle, targetBundle }
}

// TODO mv
export type ConfigArtifacts = {
  [referenceName: string]: {
    buildInfo: BuildInfo
    artifact: ContractArtifact
  }
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
  artifacts: ConfigArtifacts
): Promise<ChugSplashActionBundle> => {
  const managerAddress = getChugSplashManagerAddress(
    parsedConfig.options.claimer,
    parsedConfig.options.organizationID
  )

  const actions: ChugSplashAction[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { buildInfo, artifact } = artifacts[referenceName]
    const { sourceName, contractName, abi, bytecode } = artifact

    const storageLayout = getStorageLayout(
      buildInfo.output,
      sourceName,
      contractName
    )

    const creationCodeWithConstructorArgs = getCreationCodeWithConstructorArgs(
      bytecode,
      contractConfig.constructorArgs,
      referenceName,
      abi
    )

    // Skip adding a `DEPLOY_CONTRACT` action if the contract has already been deployed.
    if (
      (await provider.getCode(
        getContractAddress(
          managerAddress,
          referenceName,
          contractConfig.constructorArgs,
          artifact
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

    const dereferencer = astDereferencer(buildInfo.output)

    const extendedLayout = extendStorageLayout(storageLayout, dereferencer)

    // Compute our storage segments.
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
 * Generates a ChugSplash target bundle from a config file. Note that non-proxied contract types are
 * not included in the target bundle.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Target bundle generated from the parsed config file.
 */
export const makeTargetBundleFromConfig = (
  parsedConfig: ParsedChugSplashConfig,
  artifacts: ConfigArtifacts
): ChugSplashTargetBundle => {
  const { projectName, organizationID, claimer } = parsedConfig.options

  const managerAddress = getChugSplashManagerAddress(claimer, organizationID)

  const targets: ChugSplashTarget[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { artifact } = artifacts[referenceName]

    // Only add targets for proxies.
    if (contractConfig.kind !== 'no-proxy') {
      targets.push({
        projectName,
        referenceName,
        contractKindHash: contractKindHashes[contractConfig.kind],
        proxy: contractConfig.proxy,
        implementation: getContractAddress(
          managerAddress,
          referenceName,
          contractConfig.constructorArgs,
          artifact
        ),
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromTargets(targets)
}
