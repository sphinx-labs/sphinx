import assert from 'assert'

import hre, { ethers } from 'hardhat'
import '../dist' // This loads in the ChugSplash's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  AuthState,
  AuthStatus,
  ParsedChugSplashConfig,
  UserChugSplashConfig,
  ensureChugSplashInitialized,
  getAuthAddress,
  getAuthData,
  getChugSplashManagerAddress,
  getChugSplashRegistry,
  makeAuthBundle,
  getParsedOrgConfig,
  AuthLeaf,
  ParsedConfigOptions,
  ParsedOrgConfigOptions,
  signAuthRootMetaTxn,
  ContractInfo,
  getNumDeployContractActions,
  getBundleInfo,
  ConfigArtifacts,
  ConfigCache,
  BundledAuthLeaf,
  getDeploymentId,
} from '@chugsplash/core'
import {
  AuthFactoryABI,
  AuthABI,
  PROPOSER_ROLE,
  PROJECT_MANAGER_ROLE,
  ChugSplashManagerABI,
} from '@chugsplash/contracts'
import { expect } from 'chai'
import { BigNumber, providers } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { createChugSplashRuntime } from '../src/cre'
import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'

// TODO: mv
const EMPTY_PARSED_CONFIG: ParsedChugSplashConfig = {
  options: {
    orgOwners: [],
    orgOwnerThreshold: 0,
    chainIds: [],
    proposers: [],
    managers: [],
  },
  projects: {},
}

// This is the `DEFAULT_ADMIN_ROLE` used by OpenZeppelin's Access Control contract, which the Auth
// contract inherits.
const ORG_OWNER_ROLE_HASH = ethers.constants.HashZero

const cre = createChugSplashRuntime(
  false,
  false,
  hre.config.paths.canonicalConfigs,
  hre,
  false
)

const orgOwnerThreshold = 1

describe('TODO', () => {
  let owner: providers.JsonRpcSigner
  let relayer: SignerWithAddress
  let ownerAddress: string
  before(async () => {
    owner = ethers.provider.getSigner()
    ownerAddress = await owner.getAddress()

    // The relayer is the signer that executes the transactions on the Auth contract
    relayer = (await hre.ethers.getSigners())[1]
  })

  it('TODO single owner', async () => {
    // Define constructor arguments for the contract we're going to deploy
    const constructorArgs = {
      _immutableUint: 1,
      _immutableAddress: '0x' + '11'.repeat(20),
    }

    const orgOwners = [ownerAddress]
    const userConfig: UserChugSplashConfig = {
      options: {
        orgOwners,
        orgOwnerThreshold,
        networks: ['goerli'],
        proposers: [ownerAddress],
        managers: [ownerAddress],
      },
      projects: {},
    }

    const authData = getAuthData(orgOwners, orgOwnerThreshold)
    const authAddress = getAuthAddress(orgOwners, orgOwnerThreshold)
    const deployerAddress = getChugSplashManagerAddress(authAddress)

    const projectName = 'MyProject'
    const projectThreshold = 1
    userConfig.projects[projectName] = {
      options: {
        projectOwners: [ownerAddress],
        projectThreshold,
      },
      contracts: {
        MyContract: {
          contract: 'Stateless',
          kind: 'immutable',
          constructorArgs,
        },
      },
    }

    await ensureChugSplashInitialized(ethers.provider, relayer)

    const { parsedConfig, configCache, configArtifacts } =
      await getParsedOrgConfig(
        userConfig,
        projectName,
        deployerAddress,
        ethers.provider,
        cre,
        makeGetConfigArtifacts(hre)
      )

    const Registry = getChugSplashRegistry(relayer)
    const AuthFactory = new ethers.Contract(
      AUTH_FACTORY_ADDRESS,
      AuthFactoryABI,
      relayer
    )
    const Deployer = new ethers.Contract(
      deployerAddress,
      ChugSplashManagerABI,
      relayer
    )

    // We set the `registryData` to `[]` since this version of the ChugSplashManager doesn't use it.
    await AuthFactory.deploy(authData, [], 0)

    // Fund the ChugSplashManager.
    await owner.sendTransaction({
      to: deployerAddress,
      value: ethers.utils.parseEther('1'),
    })

    // Check that the ChugSplashAuth and ChugSplashManager contracts were deployed at their expected
    // addresses
    // TODO: you can should probably remove these since we're doing integration tests. wait until later
    // to do this though
    assert(
      await AuthFactory.isDeployed(authAddress),
      'Auth address is not deployed'
    )
    assert(
      await Registry.isDeployed(deployerAddress),
      'ChugSplashManager address is not deployed'
    )

    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    // Check that the Auth contract has been initialized correctly.
    expect(await Auth.orgOwnerThreshold()).deep.equals(
      BigNumber.from(orgOwnerThreshold)
    )
    expect(await Auth.getRoleMemberCount(ORG_OWNER_ROLE_HASH)).deep.equals(
      BigNumber.from(1)
    )
    expect(await Auth.hasRole(ORG_OWNER_ROLE_HASH, orgOwners[0])).equals(true)

    const EMPTY_CONFIG_INFO: ConfigInfo = {
      deployerAddress,
      chainStates: {},
    }
    const leafs = await makeAuthLeafs(
      parsedConfig,
      configArtifacts,
      configCache,
      EMPTY_PARSED_CONFIG,
      EMPTY_CONFIG_INFO
    )
    const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)
    const numLeafsPerChain = bundledLeafs.length

    // TODO: replace 5 in all fn calls
    const { leaf: setupLeaf, proof: setupProof } = findBundledLeaf(
      bundledLeafs,
      0,
      5
    )
    const { leaf: proposalLeaf, proof: proposalProof } = findBundledLeaf(
      bundledLeafs,
      1,
      5
    )
    const { leaf: createProjectLeaf, proof: createProjectProof } =
      findBundledLeaf(bundledLeafs, 2, 5)
    const { leaf: approvalLeaf, proof: approvalProof } = findBundledLeaf(
      bundledLeafs,
      3,
      5
    )

    // Check that the state of the Auth contract is correct before calling the `setup` function.
    expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(false)
    expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(false)
    // Check that the corresponding AuthState is empty.
    const initialAuthState: AuthState = await Auth.authStates(root)
    expect(initialAuthState.status).equals(AuthStatus.EMPTY)
    expect(initialAuthState.leafsExecuted).deep.equals(BigNumber.from(0))
    expect(initialAuthState.numLeafs).deep.equals(BigNumber.from(0))

    const signature = await signAuthRootMetaTxn(owner, root)

    await Auth.setup(root, setupLeaf, [signature], setupProof)

    // Check that the setup function executed correctly.
    expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(true)
    expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(true)
    let authState: AuthState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.SETUP)
    expect(authState.leafsExecuted).deep.equals(BigNumber.from(1))
    expect(authState.numLeafs).deep.equals(BigNumber.from(numLeafsPerChain))

    await Auth.propose(root, proposalLeaf, [signature], proposalProof)

    // Check that the proposal executed correctly.
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.PROPOSED)
    expect(authState.leafsExecuted).deep.equals(BigNumber.from(2))
    expect(await Auth.firstProposalOccurred()).equals(true)

    await Auth.createProject(
      root,
      createProjectLeaf,
      [signature],
      createProjectProof
    )

    // Check that the createProject function executed correctly.
    const projectOwnerRoleHash = ethers.utils.solidityKeccak256(
      ['string'],
      [`${projectName}ProjectOwner`]
    )
    expect(await Auth.getRoleMemberCount(projectOwnerRoleHash)).deep.equals(
      BigNumber.from(1)
    )
    expect(await Auth.hasRole(projectOwnerRoleHash, ownerAddress)).equals(true)
    authState = await Auth.authStates(root)
    expect(await Auth.thresholds(projectName)).deep.equals(
      BigNumber.from(projectThreshold)
    )
    expect(authState.leafsExecuted).deep.equals(BigNumber.from(3))

    // Check that there is no active deployment before approving the deployment.
    expect(await Deployer.activeDeploymentId()).equals(
      ethers.constants.HashZero
    )

    await Auth.approveDeployment(root, approvalLeaf, [signature], approvalProof)

    // Check that the approve function executed correctly and that all of the leafs in the tree have
    // been executed.
    const { configUri, bundles } = await getBundleInfo(
      parsedConfig.projects[projectName],
      configArtifacts[projectName],
      configCache[projectName]
    )
    const deploymentId = getDeploymentId(bundles, configUri, projectName)
    expect(await Deployer.activeDeploymentId()).equals(deploymentId)
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.COMPLETED)
  })
})

// TODO: Propose, approve deployments on two different chains

// TODO: mv
type ConfigInfo = {
  deployerAddress: string
  chainStates: {
    [chainId: number]: {
      firstProposalOccurred: boolean
    }
  }
}

// TODO: mv
// TODO(docs): `chainStates` must contain all of the chainIds that are in `prevConfig`.
// TODO: validate that `chainStates` contains all of the networks that are in `prevConfig`. perhaps
// do this in the parsing/validation, or in our back-end
// TODO(docs): if the user removes a network, then we don't add any leafs for that network.
const makeAuthLeafs = async (
  config: ParsedChugSplashConfig,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache,
  prevConfig: ParsedChugSplashConfig,
  prevConfigInfo: ConfigInfo
): Promise<Array<AuthLeaf>> => {
  let leafs: Array<AuthLeaf> = []

  const { options, projects } = config
  const { options: prevOptions } = prevConfig

  if (
    !isParsedOrgConfigOptions(options) ||
    !isParsedOrgConfigOptions(prevOptions)
  ) {
    throw new Error(`TODO: should never happen`)
  }

  // TODO: case: a user messes up their setup on a chain, then they change the orgOwners or
  // orgThreshold in their config when trying to re-setup. what do we do? i think we should throw an
  // error somewhere. Note that in this case, `!firstProposalOccurred`.

  const { deployerAddress, chainStates: prevChainStates } = prevConfigInfo
  const { proposers, managers, chainIds } = options
  const {
    proposers: prevProposers,
    managers: prevManagers,
    chainIds: prevChainIds,
  } = prevOptions

  const chainsToAdd = chainIds.filter((c) => !prevChainIds.includes(c))
  const chainsToKeep = chainIds.filter((c) => prevChainIds.includes(c))

  if (chainsToAdd.length > 0) {
    const TODOprevConfig: ParsedChugSplashConfig = {
      options: {
        chainIds: chainsToAdd, // TODO(docs)
        orgOwners: [],
        orgOwnerThreshold: 0,
        proposers: [],
        managers: [],
      },
      projects: {},
    }

    const TODOprevConfigInfo: ConfigInfo = {
      deployerAddress,
      chainStates: {},
    }
    chainIds.forEach((chainId) => {
      TODOprevConfigInfo.chainStates[chainId] = {
        firstProposalOccurred: false,
      }
    })

    const newChainLeafs = await makeAuthLeafs(
      config,
      configArtifacts,
      configCache,
      TODOprevConfig,
      TODOprevConfigInfo
    )
    leafs = leafs.concat(newChainLeafs)
  }

  for (const chainId of chainsToKeep) {
    const { firstProposalOccurred } = prevChainStates[chainId]
    // for (const [chainIdStr, state] of Object.entries(prevChainState)) {
    // TODO(docs)

    if (firstProposalOccurred) {
      // TODO
    } else {
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
        const setupLeaf: AuthLeaf = {
          chainId,
          to: deployerAddress,
          index: 0,
          proposers: proposersToSet,
          managers: managersToSet,
          numLeafs: 1,
          leafType: 'setup',
        }
        leafs.push(setupLeaf)
      } else {
        // TODO(docs)
        let index = 2

        for (const [projectName, projectConfig] of Object.entries(projects)) {
          const { options: projectOptions, contracts } = projectConfig
          const { projectOwners, projectThreshold } = projectOptions

          if (!projectOwners || !projectThreshold) {
            throw new Error(`TODO. Should never happen.`)
          }

          // TODO: you should only add a contract to this array if it's a user-defined address
          const contractInfoArray: Array<ContractInfo> = Object.entries(
            contracts
          ).map(([referenceName, contractConfig]) => {
            return { referenceName, addr: contractConfig.address }
          })

          const createProjectLeaf: AuthLeaf = {
            chainId,
            to: deployerAddress,
            index,
            projectName,
            projectThreshold,
            projectOwners,
            contractInfoArray,
            leafType: 'createProject',
          }
          index += 1
          leafs.push(createProjectLeaf)

          const { configUri, bundles } = await getBundleInfo(
            projectConfig,
            configArtifacts[projectName],
            configCache[projectName]
          )
          const { actionBundle, targetBundle } = bundles

          const approvalLeaf: AuthLeaf = {
            chainId,
            to: deployerAddress,
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

        const setupLeaf: AuthLeaf = {
          chainId,
          to: deployerAddress,
          index: 0,
          proposers: proposersToSet,
          managers: managersToSet,
          numLeafs: index, // TODO(docs)
          leafType: 'setup',
        }
        leafs.push(setupLeaf)

        const proposalLeaf: AuthLeaf = {
          chainId,
          to: deployerAddress,
          index: 1,
          numLeafs: index, // TODO(docs): same as above
          leafType: 'propose',
        }
        leafs.push(proposalLeaf)
      }
    }
  }

  return leafs
}

// TODO: mv
const isParsedOrgConfigOptions = (
  options: ParsedConfigOptions
): options is ParsedOrgConfigOptions => {
  return (
    options.orgOwners !== undefined &&
    options.orgOwnerThreshold !== undefined &&
    options.proposers !== undefined &&
    options.managers !== undefined &&
    options.chainIds !== undefined
  )
}

// TODO: mv
const findBundledLeaf = (
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
