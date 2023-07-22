import { fromHexString, toHexString } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'
import MerkleTree from 'merkletreejs'
import { astDereferencer } from 'solidity-ast/utils'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

import {
  CanonicalConfig,
  ConfigArtifacts,
  ConfigCache,
  ParsedConfig,
  ParsedConfigWithOptions,
  contractKindHashes,
} from '../config/types'
import {
  computeStorageSegments,
  extendStorageLayout,
} from '../languages/solidity/storage'
import {
  getCreationCodeWithConstructorArgs,
  getImplAddress,
  getDefaultProxyInitCode,
  getDeploymentId,
  getEmptyCanonicalConfig,
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
  ProposalRequest,
  RawAuthLeaf,
  RawSphinxAction,
  RoleType,
  SetStorageAction,
  ProposalRequestLeaf,
  ProjectDeployment,
} from './types'
import { getStorageLayout } from './artifacts'
import { getCreate3Address } from '../config/utils'
import { getProjectBundleInfo } from '../tasks'
import { getDeployContractCosts } from '../estimate'

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
  return (action as DeployContractAction).code !== undefined
}

export const getDeployContractActions = (
  actionBundle: SphinxActionBundle
): Array<DeployContractAction> => {
  return actionBundle.actions
    .map((action) => fromRawSphinxAction(action.action))
    .filter(isDeployContractAction)
}

export const getDeployContractActionBundle = (
  actionBundle: SphinxActionBundle
): Array<BundledSphinxAction> => {
  return actionBundle.actions.filter((action) =>
    isDeployContractAction(fromRawSphinxAction(action.action))
  )
}

export const getSetStorageActionBundle = (
  actionBundle: SphinxActionBundle
): Array<BundledSphinxAction> => {
  return actionBundle.actions.filter((action) =>
    isSetStorageAction(fromRawSphinxAction(action.action))
  )
}

export const getNumDeployContractActions = (
  actionBundle: SphinxActionBundle
): number => {
  return getDeployContractActionBundle(actionBundle).length
}

/**
 * Converts the "nice" action structs into a "raw" action struct (better for Solidity but
 * worse for users here).
 *
 * @param action Sphinx action to convert.
 * @return Converted "raw" Sphinx action.
 */
export const toRawSphinxAction = (action: SphinxAction): RawSphinxAction => {
  if (isSetStorageAction(action)) {
    return {
      actionType: SphinxActionType.SET_STORAGE,
      addr: action.addr,
      contractKindHash: action.contractKindHash,
      referenceName: action.referenceName,
      data: ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'uint8', 'bytes'],
        [action.key, action.offset, action.value]
      ),
    }
  } else if (isDeployContractAction(action)) {
    return {
      actionType: SphinxActionType.DEPLOY_CONTRACT,
      addr: action.addr,
      contractKindHash: action.contractKindHash,
      referenceName: action.referenceName,
      data: ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes'],
        [action.salt, action.code]
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
  if (rawAction.actionType === SphinxActionType.SET_STORAGE) {
    const [key, offset, value] = ethers.utils.defaultAbiCoder.decode(
      ['bytes32', 'uint8', 'bytes'],
      rawAction.data
    )
    return {
      referenceName: rawAction.referenceName,
      addr: rawAction.addr,
      contractKindHash: rawAction.contractKindHash,
      key,
      offset,
      value,
    }
  } else if (rawAction.actionType === SphinxActionType.DEPLOY_CONTRACT) {
    const [salt, code] = ethers.utils.defaultAbiCoder.decode(
      ['bytes32', 'bytes'],
      rawAction.data
    )
    return {
      referenceName: rawAction.referenceName,
      addr: rawAction.addr,
      contractKindHash: rawAction.contractKindHash,
      salt,
      code,
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
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['string', 'address', 'uint8', 'bytes32', 'bytes'],
      [
        action.referenceName,
        action.addr,
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
export const getTargetHash = (target: SphinxTarget): string => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
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
    root: root !== '0x' ? root : ethers.constants.HashZero,
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

export const getEncodedAuthLeafData = (leaf: AuthLeaf): string => {
  switch (leaf.leafType) {
    /************************ OWNER ACTIONS *****************************/
    case 'setup':
      return utils.defaultAbiCoder.encode(
        ['tuple(address member, bool add)[]', 'uint256'],
        [leaf.proposers, leaf.numLeafs]
      )

    case 'exportProxy':
      return utils.defaultAbiCoder.encode(
        ['address', 'bytes32', 'address'],
        [leaf.proxy, leaf.contractKindHash, leaf.newOwner]
      )

    case 'setOwner':
      return utils.defaultAbiCoder.encode(
        ['address', 'bool'],
        [leaf.owner, leaf.add]
      )

    case 'setThreshold':
      return utils.defaultAbiCoder.encode(['uint256'], [leaf.newThreshold])

    case 'transferDeployerOwnership':
      return utils.defaultAbiCoder.encode(['address'], [leaf.newOwner])

    case 'upgradeDeployerImplementation':
      return utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [leaf.impl, leaf.data]
      )

    case 'upgradeAuthImplementation':
      return utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [leaf.impl, leaf.data]
      )

    case 'upgradeDeployerAndAuthImpl':
      return utils.defaultAbiCoder.encode(
        ['address', 'bytes', 'address', 'bytes'],
        [leaf.deployerImpl, leaf.deployerData, leaf.authImpl, leaf.authData]
      )

    case 'setProposer':
      return utils.defaultAbiCoder.encode(
        ['address', 'bool'],
        [leaf.proposer, leaf.add]
      )

    case 'withdrawETH':
      return utils.defaultAbiCoder.encode(['address'], [leaf.receiver])

    case 'approveDeployment':
      return utils.defaultAbiCoder.encode(
        [
          'tuple(bytes32 actionRoot, bytes32 targetRoot, uint256 numActions, uint256 numTargets, uint256 numImmutableContracts, string configUri)',
        ],
        [leaf.approval]
      )

    case 'cancelActiveDeployment':
      return utils.defaultAbiCoder.encode(['string'], [leaf.projectName])

    /****************************** PROPOSER ACTIONS ******************************/

    case 'propose':
      return utils.defaultAbiCoder.encode(['uint256'], [leaf.numLeafs])

    default:
      throw Error(`Unknown auth leaf type. Should never happen.`)
  }
}

/**
 * @notice Gets the number of signers required to approve a leaf type, as well as the role type
 * that is required to approve the leaf.
 */
export const getAuthLeafSignerInfo = (
  ownerThreshold: number,
  leafType: string
): { leafThreshold: number; roleType: RoleType } => {
  if (leafType === 'propose') {
    return { leafThreshold: 1, roleType: RoleType.PROPOSER }
  } else {
    return { leafThreshold: ownerThreshold, roleType: RoleType.OWNER }
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
  return { chainId, to, index, data }
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
    throw new Error(`Cannot make an auth bundle with 0 leafs.`)
  }

  // Turn the "nice" leaf structs into raw leafs.
  const leafPairs = leafs.map((leaf) => {
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
    root: root !== '0x' ? root : ethers.constants.HashZero,
    leafs: leafPairs.map((pair) => {
      const { leaf, prettyLeaf } = pair
      return {
        leaf,
        prettyLeaf,
        proof: tree.getProof(Object.values(leaf)),
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
  actions: SphinxAction[]
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

  const a = {
    root: root !== '0x' ? root : ethers.constants.HashZero,
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

  return a
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

export const makeBundlesFromConfig = (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): SphinxBundles => {
  const actionBundle = makeActionBundleFromConfig(
    parsedConfig,
    configArtifacts,
    configCache
  )
  const targetBundle = makeTargetBundleFromConfig(parsedConfig, configArtifacts)
  return { actionBundle, targetBundle }
}

/**
 * Generates a Sphinx action bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Action bundle generated from the parsed config file.
 */
export const makeActionBundleFromConfig = (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): SphinxActionBundle => {
  const managerAddress = parsedConfig.deployer
  const actions: SphinxAction[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { buildInfo, artifact } = configArtifacts[referenceName]
    const { sourceName, contractName, abi, bytecode } = artifact
    const { isTargetDeployed } = configCache.contractConfigCache[referenceName]
    const { kind, address, salt, constructorArgs } = contractConfig

    if (!isTargetDeployed) {
      if (kind === 'immutable') {
        // Add a DEPLOY_CONTRACT action for the unproxied contract.
        actions.push({
          referenceName,
          addr: address,
          contractKindHash: contractKindHashes[kind],
          salt,
          code: getCreationCodeWithConstructorArgs(
            bytecode,
            constructorArgs,
            abi
          ),
        })
      } else if (kind === 'proxy') {
        // Add a DEPLOY_CONTRACT action for the default proxy.
        actions.push({
          referenceName,
          addr: address,
          contractKindHash: contractKindHashes[kind],
          salt,
          code: getDefaultProxyInitCode(managerAddress),
        })
      } else {
        throw new Error(
          `${referenceName} is not deployed. Should never happen.`
        )
      }
    }

    if (kind !== 'immutable') {
      // Add a DEPLOY_CONTRACT action for the proxy's implementation. Note that it may be possible
      // for the implementation to be deployed already. We don't check for that here because this
      // would slow down the Foundry plugin's FFI call to retrieve the MinimalConfig, since we would
      // need to run the parsing logic in order to get the implementation's constructor args and
      // bytecode.

      const implInitCode = getCreationCodeWithConstructorArgs(
        bytecode,
        constructorArgs,
        abi
      )
      // We use a 'salt' value that's a hash of the implementation contract's init code. This
      // essentially mimics the behavior of Create2 in the sense that the implementation's address
      // has a one-to-one mapping with its init code. This allows us to skip deploying implementation
      // contracts that have already been deployed.
      const implSalt = ethers.utils.keccak256(implInitCode)
      const implAddress = getCreate3Address(managerAddress, implSalt)

      actions.push({
        referenceName,
        addr: implAddress,
        contractKindHash: contractKindHashes['implementation'],
        salt: implSalt,
        code: implInitCode,
      })
    }

    const storageLayout = getStorageLayout(
      buildInfo.output,
      sourceName,
      contractName
    )
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
        addr: address,
        contractKindHash: contractKindHashes[kind],
        key: segment.key,
        offset: segment.offset,
        value: segment.val,
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeActionBundle(actions)
}

/**
 * Generates a Sphinx target bundle from a config file. Note that non-proxied contract types are
 * not included in the target bundle.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Target bundle generated from the parsed config file.
 */
export const makeTargetBundleFromConfig = (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts
): SphinxTargetBundle => {
  const { deployer } = parsedConfig

  const targets: SphinxTarget[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { abi, bytecode } = configArtifacts[referenceName].artifact

    // Only add targets for proxies.
    if (contractConfig.kind !== 'immutable') {
      targets.push({
        contractKindHash: contractKindHashes[contractConfig.kind],
        addr: contractConfig.address,
        implementation: getImplAddress(
          deployer,
          bytecode,
          contractConfig.constructorArgs,
          abi
        ),
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeTargetBundle(targets)
}

/**
 * @notice Generates a list of AuthLeafs for a chain by comparing the current parsed config with the
 * previous config. If the current parsed config is completely new, then the previous config
 * must be an empty config, which can be generated by calling `getEmptyCanonicalConfig`. If a
 * chain ID exists in the parsed config but does not exist in the previous config, then this
 * function will generate the leafs required to approve the project's deployment on the new chain.
 * Note that this function will throw an error if the provided `chainId` is not in the parsed
 * config.
 *
 * @param projectName Name of the project to generate leafs for. If the project hasn't changed, then
 * no project-specific leafs will be generated.
 */
export const getAuthLeafsForChain = async (
  chainId: number,
  parsedConfig: ParsedConfigWithOptions,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache,
  prevConfig: CanonicalConfig
): Promise<Array<AuthLeaf>> => {
  const { options, project } = parsedConfig
  const { proposers, chainIds } = options

  // Get the previous config to use in the rest of this function. If the previous config
  // contains this chain ID, then we use the previous config. Otherwise, we generate an empty
  // config, which makes it easy to generate leafs for a new chain.
  const prevConfigForChain = prevConfig.chainStates[chainId]
    ? prevConfig
    : getEmptyCanonicalConfig(
        [chainId],
        prevConfig.deployer,
        prevConfig.options.orgId,
        project
      )

  const {
    deployer,
    chainStates: prevChainStates,
    options: prevOptions,
  } = prevConfigForChain
  const prevProposers = prevOptions.proposers
  const { firstProposalOccurred } = prevChainStates[chainId]

  if (!chainIds.includes(chainId)) {
    throw new Error(
      `Chain ${chainId} is not in the list of chainIds in the config file.`
    )
  }

  // We get a list of proposers to add and remove by comparing the current and previous proposers.
  //  It's possible that we'll need to remove proposers even if the first proposal has not
  //  occurred yet. This is because the user may have already attempted to setup the project with an
  //  incorrect set of proposers.
  const proposersToAdd = proposers.filter((p) => !prevProposers.includes(p))
  const proposersToRemove = prevProposers.filter((p) => !proposers.includes(p))

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

  const { configUri, bundles } = await getProjectBundleInfo(
    parsedConfig,
    configArtifacts,
    configCache
  )
  const { actionBundle, targetBundle } = bundles

  // Only add the ApproveDeployment leaf if there are deployment actions.
  if (
    bundles.actionBundle.actions.length > 0 ||
    bundles.targetBundle.targets.length > 0
  ) {
    const approvalLeaf: AuthLeaf = {
      chainId,
      to: deployer,
      index,
      approval: {
        actionRoot: actionBundle.root,
        targetRoot: targetBundle.root,
        numActions: actionBundle.actions.length,
        numTargets: targetBundle.targets.length,
        numImmutableContracts: getNumDeployContractActions(actionBundle),
        configUri,
      },
      leafType: 'approveDeployment',
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
      to: deployer,
      index: 0,
      numLeafs: index,
      leafType: 'propose',
    }
    leafs.push(proposalLeaf)
  } else if (!firstProposalOccurred) {
    // We always add a Setup leaf if the first proposal hasn't occurred yet.
    const setupLeaf: AuthLeaf = {
      chainId,
      to: deployer,
      index: 0,
      proposers: proposersToSet,
      numLeafs: index,
      leafType: 'setup',
    }
    leafs.push(setupLeaf)

    // Add a proposal leaf if there are any leafs to propose.
    if (addProposalLeaf) {
      const proposalLeaf: AuthLeaf = {
        chainId,
        to: deployer,
        index: 1,
        numLeafs: index,
        leafType: 'propose',
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
  chainId: number
): BundledAuthLeaf => {
  const leaf = bundledLeafs.find(
    ({ leaf: l }) => l.index === index && l.chainId === chainId
  )
  if (!leaf) {
    throw new Error(`Leaf not found for index ${index} and chainId ${chainId}`)
  }
  return leaf
}

/**
 * @notice Gets the proposal request leaf for a given chain-specific index and chain ID.
 *
 * @param proposalRequestLeafs List of ProposalRequest leafs.
 * @param index Index of the leaf on the specified chain.
 * @param chainId Chain ID of the leaf.
 */
export const findProposalRequestLeaf = (
  proposalRequestLeafs: Array<ProposalRequestLeaf>,
  index: number,
  chainId: number
): ProposalRequestLeaf => {
  const leaf = proposalRequestLeafs.find(
    (l) => l.index === index && l.chainId === chainId
  )
  if (!leaf) {
    throw new Error(`Leaf not found for index ${index} and chainId ${chainId}`)
  }
  return leaf
}

export const getProjectDeploymentForChain = async (
  leafs: Array<AuthLeaf>,
  chainId: number,
  project: string,
  configUri: string,
  bundles: SphinxBundles
): Promise<ProjectDeployment | undefined> => {
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
    chainId,
    deploymentId,
    name: project,
  }
}

/**
 * @notice Gets the estimated amount of gas required to execute an auth tree.
 */
export const getGasEstimates = async (
  leafs: Array<AuthLeaf>,
  configArtifacts: ConfigArtifacts
): Promise<ProposalRequest['gasEstimates']> => {
  // Get a list of all the unique chain IDs
  const chainIds = new Set(leafs.map((l) => l.chainId))

  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const chainId of chainIds) {
    // Filter the leafs to only include leafs on this chain
    const leafsOnChain = leafs.filter((l) => l.chainId === chainId)

    const estGasPerLeafPromises = leafsOnChain.map(async (leaf) => {
      let estLeafGas = ethers.BigNumber.from(0)

      if (isApproveDeploymentAuthLeaf(leaf)) {
        // Estimate the gas required to deploy the contracts in the project. This doesn't include
        // the gas required to execute the "ApproveDeployment" leaf, since the contracts aren't
        // executed in that transaction.
        const estDeployContractGas = getDeployContractCosts(configArtifacts)
          .map(({ cost }) => cost.toNumber())
          .reduce((a, b) => a + b, 0)
        estLeafGas = estLeafGas.add(estDeployContractGas)
      }

      // Add a constant amount of gas to account for the cost of executing the leaf. For context, it
      // costs ~350k gas to execute a Setup leaf that adds a single proposer and manager, using a
      // single owner as the signer. It costs ~100k gas to execute a Proposal leaf.
      return estLeafGas.add(450_000)
    })

    const resolved = await Promise.all(estGasPerLeafPromises)

    const estGasOnChain = resolved
      .map((cost) => cost.toNumber())
      .reduce((a, b) => a + b, 0)

    gasEstimates.push({ chainId, estimatedGas: estGasOnChain.toString() })
  }

  return gasEstimates
}

export const isApproveDeploymentAuthLeaf = (
  leaf: AuthLeaf
): leaf is ApproveDeployment => {
  return leaf.leafType === 'approveDeployment'
}
