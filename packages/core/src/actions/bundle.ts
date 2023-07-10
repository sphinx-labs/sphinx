import { fromHexString, toHexString } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'
import MerkleTree from 'merkletreejs'
import { astDereferencer } from 'solidity-ast/utils'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

import {
  CanonicalOrgConfig,
  ConfigArtifacts,
  ConfigCache,
  ParsedOrgConfig,
  ParsedProjectConfig,
  ParsedProjectConfigs,
  ProjectConfigArtifacts,
  ProjectConfigCache,
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
} from '../utils'
import {
  ApproveDeployment,
  AuthLeaf,
  AuthLeafBundle,
  BundledAuthLeaf,
  BundledChugSplashAction,
  ChugSplashAction,
  ChugSplashActionBundle,
  ChugSplashActionType,
  ChugSplashBundles,
  ChugSplashTarget,
  ChugSplashTargetBundle,
  ContractInfo,
  DeployContractAction,
  ProjectDeployments,
  RawAuthLeaf,
  RawChugSplashAction,
  RoleType,
  SetStorageAction,
} from './types'
import { getStorageLayout } from './artifacts'
import { getCreate3Address } from '../config/utils'
import { getProjectBundleInfo } from '../tasks'
import { getDeployContractCosts } from '../estimate'

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

export const getDeployContractActions = (
  actionBundle: ChugSplashActionBundle
): Array<DeployContractAction> => {
  return actionBundle.actions
    .map((action) => fromRawChugSplashAction(action.action))
    .filter(isDeployContractAction)
}

export const getDeployContractActionBundle = (
  actionBundle: ChugSplashActionBundle
): Array<BundledChugSplashAction> => {
  return actionBundle.actions.filter((action) =>
    isDeployContractAction(fromRawChugSplashAction(action.action))
  )
}

export const getSetStorageActionBundle = (
  actionBundle: ChugSplashActionBundle
): Array<BundledChugSplashAction> => {
  return actionBundle.actions.filter((action) =>
    isSetStorageAction(fromRawChugSplashAction(action.action))
  )
}

export const getNumDeployContractActions = (
  actionBundle: ChugSplashActionBundle
): number => {
  return getDeployContractActionBundle(actionBundle).length
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
      actionType: ChugSplashActionType.DEPLOY_CONTRACT,
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
      addr: rawAction.addr,
      contractKindHash: rawAction.contractKindHash,
      key,
      offset,
      value,
    }
  } else if (rawAction.actionType === ChugSplashActionType.DEPLOY_CONTRACT) {
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
export const getActionHash = (action: RawChugSplashAction): string => {
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
export const getTargetHash = (target: ChugSplashTarget): string => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes32'],
      [target.addr, target.implementation, target.contractKindHash]
    )
  )
}

export const makeTargetBundle = (
  targets: ChugSplashTarget[]
): ChugSplashTargetBundle => {
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
    /************************ ORG OWNER ACTIONS *****************************/
    case 'setup':
      return utils.defaultAbiCoder.encode(
        [
          'tuple(address member, bool add)[]',
          'tuple(address member, bool add)[]',
          'uint256',
        ],
        [leaf.proposers, leaf.managers, leaf.numLeafs]
      )
    case 'setProjectManager':
      return utils.defaultAbiCoder.encode(
        ['address', 'bool'],
        [leaf.projectManager, leaf.add]
      )

    case 'exportProxy':
      return utils.defaultAbiCoder.encode(
        ['address', 'bytes32', 'address'],
        [leaf.proxy, leaf.contractKindHash, leaf.newOwner]
      )

    case 'setOrgOwner':
      return utils.defaultAbiCoder.encode(
        ['address', 'bool'],
        [leaf.orgOwner, leaf.add]
      )

    case 'removeProject':
      return utils.defaultAbiCoder.encode(
        ['string', 'address[]'],
        [leaf.projectName, leaf.contractAddresses]
      )

    case 'setOrgThreshold':
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

    /************************ PROJECT MANAGER ACTIONS *****************************/

    case 'createProject':
      return utils.defaultAbiCoder.encode(
        [
          'string',
          'uint256',
          'address[]',
          'tuple(string referenceName, address addr)[]',
        ],
        [
          leaf.projectName,
          leaf.projectThreshold,
          leaf.projectOwners,
          leaf.contractsToImport,
        ]
      )

    case 'setProposer':
      return utils.defaultAbiCoder.encode(
        ['address', 'bool'],
        [leaf.proposer, leaf.add]
      )

    case 'withdrawETH':
      return utils.defaultAbiCoder.encode(['address'], [leaf.receiver])

    /***************************** PROJECT OWNER ACTIONS ****************************/

    case 'approveDeployment':
      return utils.defaultAbiCoder.encode(
        [
          'string',
          'bytes32',
          'bytes32',
          'uint256',
          'uint256',
          'uint256',
          'string',
        ],
        [
          leaf.projectName,
          leaf.actionRoot,
          leaf.targetRoot,
          leaf.numActions,
          leaf.numTargets,
          leaf.numImmutableContracts,
          leaf.configUri,
        ]
      )

    case 'setProjectThreshold':
      return utils.defaultAbiCoder.encode(
        ['string', 'uint256'],
        [leaf.projectName, leaf.newThreshold]
      )

    case 'setProjectOwner':
      return utils.defaultAbiCoder.encode(
        ['string', 'address', 'bool'],
        [leaf.projectName, leaf.projectOwner, leaf.add]
      )

    case 'cancelActiveDeployment':
      return utils.defaultAbiCoder.encode(['string'], [leaf.projectName])

    case 'updateContractsInProject':
      return utils.defaultAbiCoder.encode(
        ['string', 'address[]', 'bool[]'],
        [leaf.projectName, leaf.contractAddresses, leaf.addContract]
      )

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
  orgThreshold: number,
  projectThreshold: number,
  leafType: string
): { threshold: number; roleType: RoleType } => {
  switch (leafType) {
    // Org owner
    case 'setup':
    case 'setProjectManager':
    case 'exportProxy':
    case 'setOrgOwner':
    case 'removeProject':
    case 'setOrgThreshold':
    case 'transferDeployerOwnership':
    case 'upgradeDeployerImplementation':
    case 'upgradeAuthImplementation':
    case 'upgradeDeployerAndAuthImpl':
      return { threshold: orgThreshold, roleType: RoleType.ORG_OWNER }

    // Manager
    case 'createProject':
    case 'setProposer':
    case 'withdrawETH':
      return { threshold: 1, roleType: RoleType.MANAGER }

    // Project owner
    case 'approveDeployment':
    case 'setProjectThreshold':
    case 'setProjectOwner':
    case 'cancelActiveDeployment':
    case 'updateContractsInProject':
      return { threshold: projectThreshold, roleType: RoleType.PROJECT_OWNER }

    // Proposer
    case 'propose':
      return { threshold: 1, roleType: RoleType.PROPOSER }

    default:
      throw Error(`Unknown auth leaf type. Should never happen.`)
  }
}

export const toRawAuthLeaf = (leaf: AuthLeaf): RawAuthLeaf => {
  const data = getEncodedAuthLeafData(leaf)
  const { chainId, to, index } = leaf
  return { chainId, to, index, data }
}

/**
 * Generates a bundle of auth leafs. Effectively encodes the inputs that will be provided to the
 * ChugSplashAuth contract.
 *
 * @param leafs Series of auth leafs.
 * @return Bundled leafs.
 */
export const makeAuthBundle = (leafs: Array<AuthLeaf>): AuthLeafBundle => {
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
 * provided to the ChugSplashManager contract.
 *
 * @param actions Series of DeployContract and SetStorage actions to bundle.
 * @return Bundled actions.
 */
export const makeActionBundle = (
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
  parsedProjectConfig: ParsedProjectConfig,
  projectArtifacts: ProjectConfigArtifacts,
  projectConfigCache: ProjectConfigCache
): ChugSplashBundles => {
  const actionBundle = makeActionBundleFromConfig(
    parsedProjectConfig,
    projectArtifacts,
    projectConfigCache
  )
  const targetBundle = makeTargetBundleFromConfig(
    parsedProjectConfig,
    projectArtifacts
  )
  return { actionBundle, targetBundle }
}

/**
 * Generates a ChugSplash action bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Action bundle generated from the parsed config file.
 */
export const makeActionBundleFromConfig = (
  parsedConfig: ParsedProjectConfig,
  projectArtifacts: ProjectConfigArtifacts,
  projectConfigCache: ProjectConfigCache
): ChugSplashActionBundle => {
  const managerAddress = parsedConfig.options.deployer
  const actions: ChugSplashAction[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { buildInfo, artifact } = projectArtifacts[referenceName]
    const { sourceName, contractName, abi, bytecode } = artifact
    const { isTargetDeployed } =
      projectConfigCache.contractConfigCache[referenceName]
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
 * Generates a ChugSplash target bundle from a config file. Note that non-proxied contract types are
 * not included in the target bundle.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Target bundle generated from the parsed config file.
 */
export const makeTargetBundleFromConfig = (
  parsedProjectConfig: ParsedProjectConfig,
  projectConfigArtifacts: ProjectConfigArtifacts
): ChugSplashTargetBundle => {
  const { deployer } = parsedProjectConfig.options

  const targets: ChugSplashTarget[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedProjectConfig.contracts
  )) {
    const { abi, bytecode } = projectConfigArtifacts[referenceName].artifact

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
 * @notice Generates a list of AuthLeafs for a chain by comparing the current config with the
 * previous config. If the current config is new, then the previous config must be an empty config,
 * which can be generated by calling `getEmptyCanonicalOrgConfig`. Note that this function will
 * throw an error if the provided `chainId` is not in the config.
 */
export const getAuthLeafsForChain = async (
  chainId: number,
  config: ParsedOrgConfig,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache,
  prevConfig: CanonicalOrgConfig
): Promise<Array<AuthLeaf>> => {
  const leafs: Array<AuthLeaf> = []

  const { options, projects } = config
  const { options: prevOptions } = prevConfig

  const { deployer, chainStates: prevChainStates } = prevConfig
  const { proposers, managers, chainIds } = options
  const { proposers: prevProposers, managers: prevManagers } = prevOptions

  if (!chainIds.includes(chainId)) {
    throw new Error(
      `Chain ${chainId} is not in the list of chainIds in the config file.`
    )
  }

  const { firstProposalOccurred } = prevChainStates[chainId]
  if (firstProposalOccurred) {
    // Not supported yet.
  } else {
    // We get a list of proposers to add and remove by comparing the current and previous
    // proposers. We do the same for managers. Note that it's possible that we'll need to remove
    // proposers/managers despite the first that a proposal has not yet occurred. This is because
    // the user may have already attempted to setup the org on the chain with an incorrect set of
    // proposers/managers.
    const proposersToAdd = proposers.filter((p) => !prevProposers.includes(p))
    const proposersToRemove = prevProposers.filter(
      (p) => !proposers.includes(p)
    )
    const proposersToSet = proposersToAdd
      .map((p) => {
        return { member: p, add: true }
      })
      .concat(
        proposersToRemove.map((p) => {
          return { member: p, add: false }
        })
      )

    const managersToAdd = managers.filter((m) => !prevManagers.includes(m))
    const managersToRemove = prevManagers.filter((m) => !managers.includes(m))
    const managersToSet = managersToAdd
      .map((m) => {
        return { member: m, add: true }
      })
      .concat(
        managersToRemove.map((m) => {
          return { member: m, add: false }
        })
      )

    if (Object.keys(projects).length === 0) {
      // Since there are no projects, we only need to add a single leaf for the setup function.
      const setupLeaf: AuthLeaf = {
        chainId,
        to: deployer,
        index: 0,
        proposers: proposersToSet,
        managers: managersToSet,
        numLeafs: 1,
        leafType: 'setup',
      }
      leafs.push(setupLeaf)
    } else {
      // We proceed by adding leafs for each project. Note that these projects are new on this
      // chain since a proposal has not yet occurred.

      // We set the index to 2 here because the first two leafs are reserved for the setup and
      // proposal functions. We add those two leafs last because they both have a `numLeafs`
      // field, which must contain the total number of leafs on this chain. Adding these leafs
      // last makes it easy to compute this value, since it'll be equal to the index.
      let index = 2

      for (const [projectName, projectConfig] of Object.entries(projects)) {
        const { options: projectOptions, contracts } = projectConfig
        const { projectOwners, projectThreshold } = projectOptions

        // This check is necessary for TypeScript to know that `projectOwners` and
        // `projectThreshold` are defined. This is because these fields are optional, since the
        // type is shared with non-org configs, which don't have these fields.
        if (!projectOwners || !projectThreshold) {
          throw new Error(
            `Project owners or project threshold are not defined. Should never happen.`
          )
        }

        // We only import contracts into the project if the user has explictly specified an
        // address for the contract. Otherwise, the contract will eventually be deployed by
        // ChugSplash and automatically added to the project on-chain.
        const contractsToImport: Array<ContractInfo> = Object.entries(contracts)
          .filter(([, contractConfig]) => contractConfig.isUserDefinedAddress)
          .map(([referenceName, contractConfig]) => {
            return { referenceName, addr: contractConfig.address }
          })

        const createProjectLeaf: AuthLeaf = {
          chainId,
          to: deployer,
          index,
          projectName,
          projectThreshold,
          projectOwners,
          contractsToImport,
          leafType: 'createProject',
        }
        index += 1
        leafs.push(createProjectLeaf)

        const { configUri, bundles } = await getProjectBundleInfo(
          projectConfig,
          configArtifacts[projectName],
          configCache[projectName]
        )
        const { actionBundle, targetBundle } = bundles

        const approvalLeaf: AuthLeaf = {
          chainId,
          to: deployer,
          index,
          projectName,
          actionRoot: actionBundle.root,
          targetRoot: targetBundle.root,
          numActions: actionBundle.actions.length,
          numTargets: targetBundle.targets.length,
          numImmutableContracts: getNumDeployContractActions(actionBundle),
          configUri,
          leafType: 'approveDeployment',
        }
        index += 1
        leafs.push(approvalLeaf)
      }

      // Add the setup and proposal leafs last. Note that there is one setup and proposal leaf per
      // chain.
      const setupLeaf: AuthLeaf = {
        chainId,
        to: deployer,
        index: 0,
        proposers: proposersToSet,
        managers: managersToSet,
        numLeafs: index,
        leafType: 'setup',
      }
      leafs.push(setupLeaf)

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

export const getProjectDeploymentsForChain = async (
  leafs: Array<AuthLeaf>,
  chainId: number,
  projectConfigs: ParsedProjectConfigs,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): Promise<Array<ProjectDeployments>> => {
  const projectDeploymentPromises = leafs
    .filter(isApproveDeploymentAuthLeaf)
    .filter((l) => l.chainId === chainId)
    .map(async (l) => {
      const { projectName } = l
      const { configUri, bundles } = await getProjectBundleInfo(
        projectConfigs[projectName],
        configArtifacts[projectName],
        configCache[projectName]
      )
      const deploymentId = getDeploymentId(bundles, configUri, projectName)

      const estGas = getDeployContractCosts(configArtifacts[projectName])
        .map(({ cost }) => cost.toNumber())
        .reduce((a, b) => a + b, 0)

      return {
        chainId,
        deploymentId,
        name: projectName,
        estimatedGas: estGas.toString(),
      }
    })

  return Promise.all(projectDeploymentPromises)
}

export const isApproveDeploymentAuthLeaf = (
  leaf: AuthLeaf
): leaf is ApproveDeployment => {
  return leaf.leafType === 'approveDeployment'
}
