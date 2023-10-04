import fs from 'fs'

import { ethers } from 'ethers'
import MerkleTree from 'merkletreejs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

import {
  ConfigArtifacts,
  DeployContractActionInput,
  FunctionCallActionInput,
  ParsedConfig,
  RawSphinxActionInput,
} from '../config/types'
import {
  getDeploymentId,
  toHexString,
  fromHexString,
  prettyFunctionCall,
  isExtendedDeployContractActionInput,
  isExtendedFunctionCallActionInput,
} from '../utils'
import {
  ApproveDeployment,
  AuthLeaf,
  AuthLeafBundle,
  BundledAuthLeaf,
  BundledSphinxAction,
  SphinxAction,
  SphinxActionBundle,
  SphinxActionType,
  SphinxBundles,
  SphinxTarget,
  SphinxTargetBundle,
  DeployContractAction,
  RawAuthLeaf,
  RawSphinxAction,
  RoleType,
  SetStorageAction,
  ProposalRequestLeaf,
  ProjectDeployment,
  CallAction,
  HumanReadableActions,
  AuthLeafFunctions,
  UpgradeAuthAndManagerImpl,
  CancelActiveDeployment,
  AuthLeafType,
} from './types'
import { getProjectBundleInfo } from '../tasks'
import { getEstDeployContractCost } from '../estimate'
import { getAuthImplAddress, getSphinxManagerImplAddress } from '../addresses'
import { getCreate3Salt } from '../config/utils'

/**
 * Checks whether a given action is a SetStorage action.
 *
 * @param action Sphinx action to check.
 * @return `true` if the action is a SetStorage action, `false` otherwise.
 */
export const isSetStorageAction = (
  action: SphinxAction
): action is SetStorageAction => {
  return (
    (action as SetStorageAction).contractKindHash !== undefined &&
    (action as SetStorageAction).to !== undefined &&
    (action as SetStorageAction).key !== undefined &&
    (action as SetStorageAction).value !== undefined &&
    (action as SetStorageAction).offset !== undefined
  )
}

/**
 * Checks whether a given action is a DeployContract action.
 *
 * @param action Sphinx action to check.
 * @returns `true` if the action is a DeployContract action, `false` otherwise.
 */
export const isDeployContractAction = (
  action: SphinxAction
): action is DeployContractAction => {
  return (
    (action as DeployContractAction).creationCodeWithConstructorArgs !==
      undefined && (action as DeployContractAction).salt !== undefined
  )
}

export const isCallAction = (action: SphinxAction): action is CallAction => {
  return (
    (action as CallAction).to !== undefined &&
    (action as CallAction).data !== undefined &&
    (action as CallAction).nonce !== undefined
  )
}

export const getDeployContractActions = (
  actionBundle: SphinxActionBundle
): Array<DeployContractAction> => {
  return actionBundle.actions
    .map((action) => fromRawSphinxAction(action.action))
    .filter(isDeployContractAction)
}

export const getInitialActionBundle = (
  actionBundle: SphinxActionBundle
): Array<BundledSphinxAction> => {
  return actionBundle.actions.filter(
    (action) =>
      isDeployContractAction(fromRawSphinxAction(action.action)) ||
      isCallAction(fromRawSphinxAction(action.action))
  )
}

export const getSetStorageActionBundle = (
  actionBundle: SphinxActionBundle
): Array<BundledSphinxAction> => {
  return actionBundle.actions.filter((action) =>
    isSetStorageAction(fromRawSphinxAction(action.action))
  )
}

/**
 * Converts the "nice" action structs into a "raw" action struct (better for Solidity but
 * worse for users here).
 *
 * @param action Sphinx action to convert.
 * @return Converted "raw" Sphinx action.
 */
export const toRawSphinxAction = (action: SphinxAction): RawSphinxAction => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  if (isSetStorageAction(action)) {
    return {
      actionType: SphinxActionType.SET_STORAGE,
      index: action.index,
      data: coder.encode(
        ['bytes32', 'address', 'bytes32', 'uint8', 'bytes'],
        [
          action.contractKindHash,
          action.to,
          action.key,
          action.offset,
          action.value,
        ]
      ),
    }
  } else if (isDeployContractAction(action)) {
    return {
      actionType: SphinxActionType.DEPLOY_CONTRACT,
      index: action.index,
      data: coder.encode(
        ['bytes32', 'bytes'],
        [action.salt, action.creationCodeWithConstructorArgs]
      ),
    }
  } else if (isCallAction(action)) {
    return {
      actionType: SphinxActionType.CALL,
      index: action.index,
      data: coder.encode(
        ['uint256', 'address', 'bytes'],
        [action.nonce, action.to, action.data]
      ),
    }
  } else {
    throw new Error(`unknown action type`)
  }
}

/**
 * Converts a raw Sphinx action into a "nice" action struct.
 *
 * @param rawAction Raw Sphinx action to convert.
 * @returns Converted "nice" Sphinx action.
 */
export const fromRawSphinxAction = (
  rawAction: RawSphinxAction
): SphinxAction => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  if (rawAction.actionType === SphinxActionType.SET_STORAGE) {
    const [contractKindHash, to, key, offset, value] = coder.decode(
      ['bytes32', 'address', 'bytes32', 'uint8', 'bytes'],
      rawAction.data
    )
    return {
      to,
      contractKindHash,
      index: rawAction.index,
      key,
      offset,
      value,
    }
  } else if (rawAction.actionType === SphinxActionType.DEPLOY_CONTRACT) {
    const [salt, creationCodeWithConstructorArgs] = coder.decode(
      ['bytes32', 'bytes'],
      rawAction.data
    )
    return {
      index: rawAction.index,
      salt,
      creationCodeWithConstructorArgs,
    }
  } else if (rawAction.actionType === SphinxActionType.CALL) {
    const [nonce, to, data] = coder.decode(
      ['uint256', 'address', 'bytes'],
      rawAction.data
    )
    return {
      to,
      index: rawAction.index,
      data,
      nonce,
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
export const getActionHash = (action: RawSphinxAction): string => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  return ethers.keccak256(
    coder.encode(['uint8', 'bytes'], [action.actionType, action.data])
  )
}

/**
 * Computes the hash of a target.
 *
 * @param target Target to compute the hash of.
 * @return Hash of the action.
 */
export const getTargetHash = (target: SphinxTarget): string => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  return ethers.keccak256(
    coder.encode(
      ['address', 'address', 'bytes32'],
      [target.addr, target.implementation, target.contractKindHash]
    )
  )
}

export const makeTargetBundle = (
  targets: SphinxTarget[]
): SphinxTargetBundle => {
  // Compute the hash for each action.
  const elements = targets.map((target) => {
    return getTargetHash(target)
  })

  const tree = makeMerkleTree(elements)

  const root = toHexString(tree.getRoot())

  return {
    root: root !== '0x' ? root : ethers.ZeroHash,
    targets: targets.map((target, idx) => {
      const siblings = tree
        .getProof(getTargetHash(target), idx)
        .map((element) => {
          return ethers.hexlify(element.data)
        })
      return {
        target,
        siblings,
      }
    }),
  }
}

export const getEncodedAuthLeafData = (leaf: AuthLeaf): string => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  switch (leaf.functionName) {
    /************************ OWNER ACTIONS *****************************/
    case AuthLeafFunctions.SETUP:
      return coder.encode(
        ['tuple(address member, bool add)[]', 'uint256'],
        [leaf.proposers, leaf.numLeafs]
      )

    case AuthLeafFunctions.EXPORT_PROXY:
      return coder.encode(
        ['address', 'bytes32', 'address'],
        [leaf.proxy, leaf.contractKindHash, leaf.newOwner]
      )

    case AuthLeafFunctions.SET_OWNER:
      return coder.encode(['address', 'bool'], [leaf.owner, leaf.add])

    case AuthLeafFunctions.SET_THRESHOLD:
      return coder.encode(['uint256'], [leaf.newThreshold])

    case AuthLeafFunctions.TRANSFER_MANAGER_OWNERSHIP:
      return coder.encode(['address'], [leaf.newOwner])

    case AuthLeafFunctions.UPGRADE_MANAGER_IMPLEMENTATION:
      return coder.encode(['address', 'bytes'], [leaf.impl, leaf.data])

    case AuthLeafFunctions.UPGRADE_AUTH_IMPLEMENTATION:
      return coder.encode(['address', 'bytes'], [leaf.impl, leaf.data])

    case AuthLeafFunctions.UPGRADE_MANAGER_AND_AUTH_IMPL:
      return coder.encode(
        ['address', 'bytes', 'address', 'bytes'],
        [
          leaf.managerImpl,
          leaf.managerInitCallData,
          leaf.authImpl,
          leaf.authInitCallData,
        ]
      )

    case AuthLeafFunctions.SET_PROPOSER:
      return coder.encode(['address', 'bool'], [leaf.proposer, leaf.add])

    case AuthLeafFunctions.APPROVE_DEPLOYMENT:
      return coder.encode(
        [
          'tuple(bytes32 actionRoot, bytes32 targetRoot, uint256 numInitialActions, uint256 numSetStorageActions, uint256 numTargets, string configUri, bool remoteExecution)',
        ],
        [leaf.approval]
      )

    case AuthLeafFunctions.CANCEL_ACTIVE_DEPLOYMENT:
      // There isn't any data for this leaf type, so we don't encode anything.
      return coder.encode([], [])

    /****************************** PROPOSER ACTIONS ******************************/

    case AuthLeafFunctions.PROPOSE:
      return coder.encode(['uint256'], [leaf.numLeafs])

    default:
      throw Error(`Unknown auth leaf type. Should never happen.`)
  }
}

/**
 * @notice Gets the number of signers required to approve a leaf type, as well as the role type
 * that is required to approve the leaf.
 */
export const getAuthLeafSignerInfo = (
  ownerThreshold: bigint,
  functionName: string
): { leafThreshold: bigint; roleType: RoleType } => {
  if (functionName === AuthLeafFunctions.PROPOSE) {
    return { leafThreshold: 1n, roleType: RoleType.PROPOSER }
  } else {
    return { leafThreshold: ownerThreshold, roleType: RoleType.OWNER }
  }
}

export const fromRawSphinxActionInput = (
  rawAction: RawSphinxActionInput
): DeployContractActionInput | FunctionCallActionInput => {
  const { skip, fullyQualifiedName } = rawAction
  const coder = ethers.AbiCoder.defaultAbiCoder()
  if (rawAction.actionType === SphinxActionType.DEPLOY_CONTRACT) {
    const [initCode, constructorArgs, userSalt, referenceName] = coder.decode(
      ['bytes', 'bytes', 'bytes32', 'string'],
      rawAction.data
    )
    return {
      skip,
      fullyQualifiedName,
      actionType: SphinxActionType.DEPLOY_CONTRACT,
      initCode,
      constructorArgs,
      userSalt,
      referenceName,
    }
  } else if (rawAction.actionType === SphinxActionType.CALL) {
    const [to, selector, functionParams, nonce, referenceName] = coder.decode(
      ['address', 'bytes4', 'bytes', 'uint256', 'string'],
      rawAction.data
    )
    return {
      skip,
      fullyQualifiedName,
      actionType: SphinxActionType.CALL,
      to,
      selector,
      functionParams,
      nonce,
      referenceName,
    }
  } else {
    throw new Error(`Invalid action type. Should never happen.`)
  }
}

export const toRawAuthLeaf = (leaf: AuthLeaf): RawAuthLeaf => {
  const data = getEncodedAuthLeafData(leaf)
  const { chainId, to, index } = leaf
  return { chainId, to, index, data }
}

export const fromProposalRequestLeafToRawAuthLeaf = (
  leaf: ProposalRequestLeaf
): RawAuthLeaf => {
  const { chainId, to, index, data } = leaf
  return { chainId: BigInt(chainId), to, index, data }
}

/**
 * Generates a bundle of auth leafs. Effectively encodes the inputs that will be provided to the
 * SphinxAuth contract. Reverts if the list of leafs is empty, since the call to
 * `StandardMerkleTree` will fail.
 *
 * @param leafs Series of auth leafs.
 * @return Bundled leafs.
 */
export const makeAuthBundle = (leafs: Array<AuthLeaf>): AuthLeafBundle => {
  if (leafs.length === 0) {
    return {
      root: ethers.ZeroHash,
      leafs: [],
    }
  }

  // Sort the leafs according to their 'index' field. This isn't strictly necessary, but it makes
  // it easier to execute the auth leafs in order.
  const sorted = leafs.sort((a, b) => {
    return a.index - b.index
  })

  // Turn the "nice" leaf structs into raw leafs.
  const leafPairs = sorted.map((leaf) => {
    return {
      leaf: toRawAuthLeaf(leaf),
      prettyLeaf: leaf,
    }
  })

  const rawLeafArray = leafPairs.map((pair) => Object.values(pair.leaf))
  const tree = StandardMerkleTree.of(rawLeafArray, [
    'uint256',
    'address',
    'uint256',
    'bytes',
  ])

  const root = tree.root

  return {
    root: root !== '0x' ? root : ethers.ZeroHash,
    leafs: leafPairs.map((pair) => {
      const { leaf, prettyLeaf } = pair
      return {
        leaf,
        prettyLeaf,
        proof: tree.getProof(Object.values(leaf)),
        leafTypeEnum: prettyLeaf.leafTypeEnum,
      }
    }),
  }
}

/**
 * Generates an action bundle from a set of actions. Effectively encodes the inputs that will be
 * provided to the SphinxManager contract.
 *
 * @param actions Series of DeployContract and SetStorage actions to bundle.
 * @return Bundled actions.
 */
export const makeActionBundle = (
  actions: SphinxAction[],
  costs: number[]
): SphinxActionBundle => {
  // Turn the "nice" action structs into raw actions.
  const rawActions = actions.map((action) => {
    return toRawSphinxAction(action)
  })

  // Now compute the hash for each action.
  const elements = rawActions.map((action) => {
    return getActionHash(action)
  })

  const tree = makeMerkleTree(elements)

  const root = toHexString(tree.getRoot())

  return {
    root: root !== '0x' ? root : ethers.ZeroHash,
    actions: rawActions.map((action, idx) => {
      const siblings = tree
        .getProof(getActionHash(action), idx)
        .map((element) => {
          return ethers.hexlify(element.data)
        })
      return {
        action,
        gas: costs[idx],
        siblings,
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
      filledElements.push(ethers.keccak256(ethers.ZeroHash))
    }
  }

  // merkletreejs expects things to be buffers.
  return new MerkleTree(
    filledElements.map((element) => {
      return fromHexString(element)
    }),
    (el: Buffer | string): Buffer => {
      return fromHexString(ethers.keccak256(el))
    }
  )
}

export const makeBundlesFromConfig = (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts
): {
  bundles: SphinxBundles
  humanReadableActions: HumanReadableActions
} => {
  const { actionBundle, humanReadableActions } = makeActionBundleFromConfig(
    parsedConfig,
    configArtifacts
  )

  // TODO(upgrades): This is unused for now because we don't support upgrades.
  const targetBundle = {
    root: ethers.ZeroHash,
    targets: [],
  }
  // const targetBundle = makeTargetBundleFromConfig(
  //   parsedConfig,
  //   configArtifacts,
  //   configCache.chainId as SupportedChainId
  // )

  return { bundles: { actionBundle, targetBundle }, humanReadableActions }
}

// TODO(test): I got a javascript "heap out of memory" error when i removed sphinx's build info
// cache, but left a few dozen build info files in the artifacts folder. this was coming from the
// Promise.all in `makeGetConfigArtifacts`.

/**
 * Generates a Sphinx action bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Action bundle generated from the parsed config file.
 */
export const makeActionBundleFromConfig = (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts
): {
  actionBundle: SphinxActionBundle
  humanReadableActions: HumanReadableActions
} => {
  const { actionInputs } = parsedConfig

  const actions: SphinxAction[] = []
  const costs: number[] = []

  const humanReadableActions: HumanReadableActions = {}

  const notSkipping = actionInputs.filter((action) => !action.skip)

  for (let index = 0; index < notSkipping.length; index++) {
    const actionInput = actionInputs[index]
    const { fullyQualifiedName, actionType } = actionInput
    if (isExtendedDeployContractActionInput(actionInput)) {
      const { artifact, buildInfo } = configArtifacts[fullyQualifiedName]
      const { sourceName, contractName } = artifact
      const {
        initCode,
        constructorArgs,
        decodedAction,
        referenceName,
        userSalt,
      } = actionInput

      const readableSignature = prettyFunctionCall(
        referenceName,
        decodedAction.functionName,
        decodedAction.variables
      )

      const deployContractCost = getEstDeployContractCost(
        buildInfo.output.contracts[sourceName][contractName].evm.gasEstimates
      )

      // Add a DEPLOY_CONTRACT action.
      const create3Salt = getCreate3Salt(referenceName, userSalt)
      actions.push({
        index,
        salt: create3Salt,
        creationCodeWithConstructorArgs: ethers.concat([
          initCode,
          constructorArgs,
        ]),
      })

      costs.push(Number(deployContractCost))
      humanReadableActions[index] = {
        actionIndex: index,
        reason: readableSignature,
        actionType: SphinxActionType.DEPLOY_CONTRACT,
      }
    } else if (isExtendedFunctionCallActionInput(actionInput)) {
      const {
        to,
        selector,
        functionParams,
        nonce,
        referenceName,
        decodedAction,
      } = actionInput
      actions.push({
        to,
        index,
        data: ethers.concat([selector, functionParams]),
        nonce: Number(nonce),
      })

      costs.push(250_000)
      humanReadableActions[index] = {
        actionIndex: index,
        reason: prettyFunctionCall(
          referenceName,
          decodedAction.functionName,
          decodedAction.variables
        ),
        actionType: SphinxActionType.CALL,
      }
    } else {
      throw new Error(`unknown action type: ${actionType}`)
    }
  }

  // Generate a bundle from the list of actions.
  return {
    actionBundle: makeActionBundle(actions, costs),
    humanReadableActions,
  }
}

// TODO(upgrades): Make sure to use the fully qualified name as the key for the configArtifacts.
/**
 * Generates a Sphinx target bundle from a config file. Note that non-proxied contract types are
 * not included in the target bundle.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Target bundle generated from the parsed config file.
 */
// export const makeTargetBundleFromConfig = (
//   parsedConfig: ParsedConfig,
//   configArtifacts: ConfigArtifacts,
//   chainId: SupportedChainId
// ): SphinxTargetBundle => {
//   const { manager } = parsedConfig

//   const targets: SphinxTarget[] = []
//   for (const [referenceName, contractConfig] of Object.entries(
//     parsedConfig.contracts
//   )) {
//     const { abi, bytecode } = configArtifacts[fullyQualifiedName].artifact

//     // Only add targets for proxies.
//     if (contractConfig.kind !== 'immutable') {
//       targets.push({
//         contractKindHash: contractKindHashes[contractConfig.kind],
//         addr: contractConfig.address,
//         implementation: getImplAddress(
//           manager,
//           bytecode,
//           contractConfig.constructorArgs[chainId]!,
//           abi
//         ),
//       })
//     }
//   }

//   // Generate a bundle from the list of actions.
//   return makeTargetBundle(targets)
// }

/**
 * @notice Generates a list of AuthLeafs for a chain by comparing the current parsed config with the
 * previous chain state.
 *
 * @param projectName Name of the project to generate leafs for. If the project hasn't changed, then
 * no project-specific leafs will be generated.
 */
export const getAuthLeafsForChain = async (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts
): Promise<Array<AuthLeaf>> => {
  const { chainId, managerAddress, initialState, newConfig, remoteExecution } =
    parsedConfig
  const {
    firstProposalOccurred,
    isExecuting,
    proposers: prevProposers,
    version: prevManagerVersion,
  } = initialState
  const { proposers: newProposers, version: newManagerVersion } = newConfig

  // We get a list of proposers to add and remove by comparing the current and previous proposers.
  //  It's possible that we'll need to remove proposers even if the first proposal has not
  //  occurred yet. This is because the user may have already attempted to setup the project with an
  //  incorrect set of proposers.
  const proposersToAdd = newProposers.filter((p) => !prevProposers.includes(p))
  const proposersToRemove = prevProposers.filter(
    (p) => !newProposers.includes(p)
  )

  // Transform the list of proposers to add/remove into a list of tuples that will be used
  // in the Setup leaf, if it's needed.
  const proposersToSet = proposersToAdd
    .map((p) => {
      return { member: p, add: true }
    })
    .concat(
      proposersToRemove.map((p) => {
        return { member: p, add: false }
      })
    )

  const leafs: Array<AuthLeaf> = []

  // We proceed by adding the leafs on this chain. We add the proposal and setup leaf at the end of
  // this function because they both have a `numLeafs` field, which equals the total number of leafs
  // on this chain. We use this `index` variable as a running count of the number of leafs, then use
  // it as the value for `numLeafs` when we create the proposal and setup leaf. If the first
  // proposal has occurred, we set the initial value of this index to 1 because we're reserving the
  // first index for the proposal leaf. If the first proposal has not occurred, the index is 2
  // because the first two indexes are reserved for the setup and proposal leafs.
  let index = firstProposalOccurred ? 1 : 2

  // If a previous deployment is currently executing, we cancel it. The user may need to cancel the
  // previous deployment if one of their actions reverted during the execution process.
  if (isExecuting) {
    const cancelDeploymentLeaf: CancelActiveDeployment = {
      chainId,
      to: managerAddress,
      index,
      functionName: AuthLeafFunctions.CANCEL_ACTIVE_DEPLOYMENT,
      leafTypeEnum: AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT,
    }
    index += 1
    leafs.push(cancelDeploymentLeaf)
  }

  const equalManagerVersion =
    prevManagerVersion.major === newManagerVersion.major &&
    prevManagerVersion.minor === newManagerVersion.minor &&
    prevManagerVersion.patch === newManagerVersion.patch
  if (!equalManagerVersion) {
    const upgradeLeaf: UpgradeAuthAndManagerImpl = {
      chainId,
      to: managerAddress,
      index,
      functionName: AuthLeafFunctions.UPGRADE_MANAGER_AND_AUTH_IMPL,
      leafTypeEnum: AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL,
      managerInitCallData: '0x',
      managerImpl: getSphinxManagerImplAddress(chainId, newManagerVersion),
      authInitCallData: '0x',
      authImpl: getAuthImplAddress(newManagerVersion),
    }
    index += 1
    leafs.push(upgradeLeaf)
  }

  const { configUri, bundles } = await getProjectBundleInfo(
    parsedConfig,
    configArtifacts
  )
  const { actionBundle, targetBundle } = bundles

  // Only add the ApproveDeployment leaf if there are deployment actions.
  if (
    bundles.actionBundle.actions.length > 0 ||
    bundles.targetBundle.targets.length > 0
  ) {
    const numTotalActions = actionBundle.actions.length
    const numSetStorageActions = actionBundle.actions
      .map((action) => fromRawSphinxAction(action.action))
      .filter(isSetStorageAction).length

    const approvalLeaf: ApproveDeployment = {
      chainId,
      to: managerAddress,
      index,
      approval: {
        actionRoot: actionBundle.root,
        targetRoot: targetBundle.root,
        numInitialActions: numTotalActions - numSetStorageActions,
        numSetStorageActions,
        numTargets: targetBundle.targets.length,
        configUri,
        remoteExecution,
      },
      functionName: AuthLeafFunctions.APPROVE_DEPLOYMENT,
      leafTypeEnum: AuthLeafType.APPROVE_DEPLOYMENT,
    }
    index += 1
    leafs.push(approvalLeaf)
  }

  // We only add a proposal leaf if the `leafs` array is non-empty. If the array is empty, then
  // there's nothing to propose.
  const addProposalLeaf = leafs.length > 0

  if (firstProposalOccurred && addProposalLeaf) {
    const proposalLeaf: AuthLeaf = {
      chainId,
      to: managerAddress,
      index: 0,
      numLeafs: index,
      functionName: AuthLeafFunctions.PROPOSE,
      leafTypeEnum: AuthLeafType.PROPOSE,
    }
    leafs.push(proposalLeaf)
  } else if (!firstProposalOccurred) {
    // We always add a Setup leaf if the first proposal hasn't occurred yet.
    const setupLeaf: AuthLeaf = {
      chainId,
      to: managerAddress,
      index: 0,
      proposers: proposersToSet,
      numLeafs: index,
      functionName: AuthLeafFunctions.SETUP,
      leafTypeEnum: AuthLeafType.SETUP,
    }
    leafs.push(setupLeaf)

    // Add a proposal leaf if there are any leafs to propose.
    if (addProposalLeaf) {
      const proposalLeaf: AuthLeaf = {
        chainId,
        to: managerAddress,
        index: 1,
        numLeafs: index,
        functionName: AuthLeafFunctions.PROPOSE,
        leafTypeEnum: AuthLeafType.PROPOSE,
      }
      leafs.push(proposalLeaf)
    }
  }

  return leafs
}

/**
 * @notice Gets the bundled leaf for a given chain-specific index and chain ID.
 *
 * @param bundledLeafs List of bundled leafs.
 * @param index Index of the leaf on the specified chain.
 * @param chainId Chain ID of the leaf.
 */
export const findBundledLeaf = (
  bundledLeafs: Array<BundledAuthLeaf>,
  index: number,
  chainId: bigint
): BundledAuthLeaf => {
  const leaf = bundledLeafs.find(
    ({ leaf: l }) => l.index === index && l.chainId === chainId
  )
  if (!leaf) {
    throw new Error(`Leaf not found for index ${index} and chainId ${chainId}`)
  }
  return leaf
}

export const getProjectDeploymentForChain = (
  leafs: Array<AuthLeaf>,
  parsedConfig: ParsedConfig,
  configUri: string,
  bundles: SphinxBundles
): ProjectDeployment | undefined => {
  const { newConfig, initialState, chainId } = parsedConfig

  const approvalLeafs = leafs
    .filter(isApproveDeploymentAuthLeaf)
    .filter((l) => l.chainId === chainId)

  if (approvalLeafs.length === 0) {
    return undefined
  } else if (approvalLeafs.length > 1) {
    throw new Error(
      `Found multiple approval leafs for chain ${chainId}. Should never happen.`
    )
  }

  const deploymentId = getDeploymentId(bundles, configUri)

  return {
    chainId: Number(chainId),
    deploymentId,
    name: newConfig.projectName,
    isExecuting: initialState.isExecuting,
  }
}

export const isApproveDeploymentAuthLeaf = (
  leaf: AuthLeaf
): leaf is ApproveDeployment => {
  return leaf.functionName === AuthLeafFunctions.APPROVE_DEPLOYMENT
}
