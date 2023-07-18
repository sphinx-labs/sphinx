import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  AuthState,
  AuthStatus,
  UserSphinxConfig,
  ensureSphinxInitialized,
  getAuthAddress,
  getAuthData,
  getSphinxManagerAddress,
  makeAuthBundle,
  getParsedOrgConfig,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  getEmptyCanonicalOrgConfig,
  findBundledLeaf,
  getAuthLeafsForChain,
  AuthLeaf,
} from '@sphinx/core'
import {
  AuthFactoryABI,
  AuthABI,
  PROPOSER_ROLE,
  PROJECT_MANAGER_ROLE,
  SphinxManagerABI,
} from '@sphinx/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import { createSphinxRuntime } from '../src/cre'
import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'

// This is the `DEFAULT_ADMIN_ROLE` used by OpenZeppelin's Access Control contract, which the Auth
// contract inherits.
const ORG_OWNER_ROLE_HASH = ethers.constants.HashZero

const DUMMY_ORG_ID = '1111'

const cre = createSphinxRuntime(
  false,
  false,
  hre.config.paths.canonicalConfigs,
  hre,
  false
)

const orgThreshold = 1

// First account on Hardhat node
const ownerPrivateKey =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
// Second account on Hardhat node
const relayerPrivateKey =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

describe('Org config', () => {
  let ownerAddress: string
  before(async () => {
    ownerAddress = new ethers.Wallet(ownerPrivateKey).address
  })

  it('Single owner can setup an org and approve a project deployment on two chains in one txn', async () => {
    // Define constructor arguments for the contract we're going to deploy
    const constructorArgs = {
      _immutableUint: 1,
      _immutableAddress: '0x' + '11'.repeat(20),
    }

    const isTestnet = true
    const testnets = ['goerli', 'optimism-goerli']
    const providers = {
      goerli: new ethers.providers.JsonRpcProvider('http://localhost:8545'),
      'optimism-goerli': new ethers.providers.JsonRpcProvider(
        'http://localhost:8546'
      ),
    }

    const orgOwners = [ownerAddress]
    const userConfig: UserSphinxConfig = {
      options: {
        orgId: DUMMY_ORG_ID,
        orgOwners,
        orgThreshold,
        testnets,
        mainnets: [],
        proposers: [ownerAddress],
        managers: [ownerAddress],
      },
      projects: {},
    }

    const authData = getAuthData(orgOwners, orgThreshold)
    const authAddress = getAuthAddress(orgOwners, orgThreshold)
    const deployerAddress = getSphinxManagerAddress(authAddress)

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

    const leafs: Array<AuthLeaf> = []
    for (const network of testnets) {
      const provider = providers[network]
      const relayer = new ethers.Wallet(relayerPrivateKey, provider)

      await ensureSphinxInitialized(provider, relayer)

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedOrgConfig(
          userConfig,
          projectName,
          deployerAddress,
          isTestnet,
          provider,
          cre,
          makeGetConfigArtifacts(hre)
        )

      const chainId = SUPPORTED_NETWORKS[network]
      const prevOrgConfig = getEmptyCanonicalOrgConfig(
        [chainId],
        deployerAddress,
        DUMMY_ORG_ID,
        projectName
      )
      const leafsForChain = await getAuthLeafsForChain(
        chainId,
        parsedConfig,
        configArtifacts,
        configCache,
        prevOrgConfig
      )
      leafs.push(...leafsForChain)
    }

    const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

    for (const network of testnets) {
      const provider = providers[network]

      const owner = new ethers.Wallet(ownerPrivateKey, provider)
      // The relayer is the signer that executes the transactions on the Auth contract
      const relayer = new ethers.Wallet(relayerPrivateKey, provider)

      const AuthFactory = new ethers.Contract(
        AUTH_FACTORY_ADDRESS,
        AuthFactoryABI,
        relayer
      )
      const Deployer = new ethers.Contract(
        deployerAddress,
        SphinxManagerABI,
        relayer
      )
      const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

      // We set the `registryData` to `[]` since this version of the SphinxManager doesn't use it.
      await AuthFactory.deploy(authData, [], 0)

      // Fund the SphinxManager.
      await owner.sendTransaction({
        to: deployerAddress,
        value: ethers.utils.parseEther('1'),
      })

      // Check that the Auth contract has been initialized correctly.
      expect(await Auth.orgThreshold()).deep.equals(
        BigNumber.from(orgThreshold)
      )
      expect(await Auth.getRoleMemberCount(ORG_OWNER_ROLE_HASH)).deep.equals(
        BigNumber.from(1)
      )
      expect(await Auth.hasRole(ORG_OWNER_ROLE_HASH, orgOwners[0])).equals(true)

      const chainId = SUPPORTED_NETWORKS[network]
      const numLeafsPerChain = bundledLeafs.length / testnets.length

      const { leaf: setupLeaf, proof: setupProof } = findBundledLeaf(
        bundledLeafs,
        0,
        chainId
      )
      const { leaf: proposalLeaf, proof: proposalProof } = findBundledLeaf(
        bundledLeafs,
        1,
        chainId
      )
      const { leaf: createProjectLeaf, proof: createProjectProof } =
        findBundledLeaf(bundledLeafs, 2, chainId)
      const { leaf: approvalLeaf, proof: approvalProof } = findBundledLeaf(
        bundledLeafs,
        3,
        chainId
      )

      // Check that the state of the Auth contract is correct before calling the `setup` function.
      expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(false)
      expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(
        false
      )
      // Check that the corresponding AuthState is empty.
      const initialAuthState: AuthState = await Auth.authStates(root)
      expect(initialAuthState.status).equals(AuthStatus.EMPTY)
      expect(initialAuthState.leafsExecuted).deep.equals(BigNumber.from(0))
      expect(initialAuthState.numLeafs).deep.equals(BigNumber.from(0))

      const signature = await signAuthRootMetaTxn(owner, root)

      await Auth.setup(root, setupLeaf, [signature], setupProof)

      // Check that the setup function executed correctly.
      expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(true)
      expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(
        true
      )
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
      expect(await Auth.hasRole(projectOwnerRoleHash, ownerAddress)).equals(
        true
      )
      authState = await Auth.authStates(root)
      expect(await Auth.thresholds(projectName)).deep.equals(
        BigNumber.from(projectThreshold)
      )
      expect(authState.leafsExecuted).deep.equals(BigNumber.from(3))

      // Check that there is no active deployment before approving the deployment.
      expect(await Deployer.activeDeploymentId()).equals(
        ethers.constants.HashZero
      )

      await Auth.approveDeployment(
        root,
        approvalLeaf,
        [signature],
        approvalProof
      )

      // Check that the approve function executed correctly and that all of the leafs in the tree have
      // been executed.
      const { parsedConfig, configCache, configArtifacts } =
        await getParsedOrgConfig(
          userConfig,
          projectName,
          deployerAddress,
          isTestnet,
          provider,
          cre,
          makeGetConfigArtifacts(hre)
        )
      const { configUri, bundles } = await getProjectBundleInfo(
        parsedConfig.projects[projectName],
        configArtifacts[projectName],
        configCache[projectName]
      )
      const deploymentId = getDeploymentId(bundles, configUri, projectName)
      expect(await Deployer.activeDeploymentId()).equals(deploymentId)
      authState = await Auth.authStates(root)
      expect(authState.status).equals(AuthStatus.COMPLETED)
    }
  })
})
