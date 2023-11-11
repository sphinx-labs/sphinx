import { ethers } from 'ethers'
import MerkleTree from 'merkletreejs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { LeafType, LeafWithProof, SphinxBundle } from '@sphinx-labs/contracts'

import { ActionInput, CompilerConfig } from '../config/types'
import { toHexString, fromHexString } from '../utils'
import {
  AuthLeaf,
  AuthLeafBundle,
  BundledAuthLeaf,
  SphinxAction,
  SphinxActionBundle,
  SphinxActionType,
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
  AuthLeafFunctions,
  CreateAction,
} from './types'

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
    (action as CallAction).data !== undefined
  )
}

export const isCreateAction = (
  action: SphinxAction
): action is CreateAction => {
  return (action as CreateAction).initCode !== undefined
}

export const getDeployContractActions = (
  actionBundle: SphinxActionBundle
): Array<DeployContractAction> => {
  return actionBundle.actions
    .map((action) => fromRawSphinxAction(action.action))
    .filter(isDeployContractAction)
}

export const getTargetNetworkLeafs = (
  chainId: bigint,
  leafs: Array<LeafWithProof>
): Array<LeafWithProof> => {
  return leafs.filter((leaf) => leaf.leaf.chainId === chainId)
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
      index: BigInt(action.index),
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
      index: BigInt(action.index),
      data: coder.encode(
        ['bytes32', 'bytes'],
        [action.salt, action.creationCodeWithConstructorArgs]
      ),
    }
  } else if (isCallAction(action)) {
    return {
      actionType: SphinxActionType.CALL,
      index: BigInt(action.index),
      data: coder.encode(['address', 'bytes'], [action.to, action.data]),
    }
  } else if (isCreateAction(action)) {
    return {
      actionType: SphinxActionType.CREATE,
      index: BigInt(action.index),
      data: action.initCode,
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
      index: Number(rawAction.index),
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
      index: Number(rawAction.index),
      salt,
      creationCodeWithConstructorArgs,
    }
  } else if (rawAction.actionType === SphinxActionType.CALL) {
    const [to, data] = coder.decode(['address', 'bytes'], rawAction.data)
    return {
      to,
      index: Number(rawAction.index),
      data,
    }
  } else if (rawAction.actionType === SphinxActionType.CREATE) {
    return {
      initCode: rawAction.data,
      index: Number(rawAction.index),
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
  ownerThreshold: string,
  functionName: string
): { leafThreshold: bigint; roleType: RoleType } => {
  if (functionName === AuthLeafFunctions.PROPOSE) {
    return { leafThreshold: 1n, roleType: RoleType.PROPOSER }
  } else {
    return { leafThreshold: BigInt(ownerThreshold), roleType: RoleType.OWNER }
  }
}

// export const fromRawSphinxActionInput = (
//   rawAction: RawSphinxActionInput
// ): DeployContractActionInput | FunctionCallActionInput => {
//   const { skip, fullyQualifiedName } = rawAction
//   const coder = ethers.AbiCoder.defaultAbiCoder()
//   if (rawAction.actionType === SphinxActionType.DEPLOY_CONTRACT) {
//     const [initCode, constructorArgs, userSalt, referenceName] = coder.decode(
//       ['bytes', 'bytes', 'bytes32', 'string'],
//       rawAction.data
//     )
//     return {
//       skip,
//       fullyQualifiedName,
//       actionType: SphinxActionType.DEPLOY_CONTRACT.toString(),
//       initCode,
//       constructorArgs,
//       userSalt,
//       referenceName,
//     }
//   } else if (rawAction.actionType === SphinxActionType.CALL) {
//     const [to, selector, functionParams, nonce, referenceName] = coder.decode(
//       ['address', 'bytes4', 'bytes', 'uint256', 'string'],
//       rawAction.data
//     )
//     return {
//       skip,
//       fullyQualifiedName,
//       actionType: SphinxActionType.CALL.toString(),
//       to,
//       selector,
//       functionParams,
//       nonce,
//       referenceName,
//     }
//   } else {
//     throw new Error(`Invalid action type. Should never happen.`)
//   }
// }

export const toRawAuthLeaf = (leaf: AuthLeaf): RawAuthLeaf => {
  const data = getEncodedAuthLeafData(leaf)
  const { chainId, to, index } = leaf
  return { chainId, to, index: BigInt(index), data }
}

export const fromProposalRequestLeafToRawAuthLeaf = (
  leaf: ProposalRequestLeaf
): RawAuthLeaf => {
  const { chainId, to, index, data } = leaf
  return { chainId: BigInt(chainId), to, index: BigInt(index), data }
}

/**
 * Generates a bundle of auth leafs. Effectively encodes the inputs that will be provided to the
 * SphinxAuth contract.
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

  // Sort the leafs in ascending order, prioritizing the `chainId` field first and then the `index`
  // field. Specifically, it sorts the array in ascending order based on chainId; if two elements
  // have the same chainId, it further sorts them based on the ascending order of their `index`
  // value.
  const sorted = leafs.sort((a, b) => {
    // First compare the chainId fields
    if (a.chainId < b.chainId) {
      return -1
    }
    if (a.chainId > b.chainId) {
      return 1
    }

    // Chain ID is the same, now compare the index fields
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
        leafFunctionName: prettyLeaf.functionName,
      }
    }),
  }
}

/**
 * Generates an action bundle from a set of actions. Effectively encodes the inputs that will be
 * provided to the SphinxManager contract.
 *
 * @param actions Series of actions to bundle.
 * @return Bundled actions.
 */
export const makeActionBundle = (
  actions: SphinxAction[],
  actionInputs: ActionInput[]
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
        // Use a 20% buffer to account for potential difference between
        // the estimated gas and the actual gas used by the action.
        gas: (BigInt(actionInputs[idx].gas) * 120n) / 100n,
        siblings,
        contracts: actionInputs[idx].contracts,
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

/**
 * @notice Gets the bundled leaf for a given chain-specific index and chain ID.
 *
 * @param bundledLeafs List of bundled leafs.
 * @param index Index of the leaf on the specified chain.
 * @param chainId Chain ID of the leaf.
 */
export const findBundledLeaf = (
  bundledLeafs: Array<BundledAuthLeaf>,
  index: bigint,
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
  configUri: string,
  bundle: SphinxBundle,
  compilerConfig: CompilerConfig
): ProjectDeployment | undefined => {
  const { newConfig, initialState, chainId } = compilerConfig

  const approvalLeafs = bundle.leafs.filter(
    (l) =>
      l.leaf.leafType === LeafType.APPROVE && l.leaf.chainId === BigInt(chainId)
  )

  if (approvalLeafs.length === 0) {
    return undefined
  } else if (approvalLeafs.length > 1) {
    throw new Error(
      `Found multiple approval leafs for chain ${chainId}. Should never happen.`
    )
  }

  const deploymentId = bundle.root

  return {
    chainId: Number(chainId),
    deploymentId,
    name: newConfig.projectName,
    isExecuting: initialState.isExecuting,
    configUri,
  }
}
