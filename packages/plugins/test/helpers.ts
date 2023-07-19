import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AuthState,
  AuthStatus,
  makeAuthBundle,
  getParsedOrgConfig,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  getEmptyCanonicalOrgConfig,
  findBundledLeaf,
  getAuthLeafs,
  AuthLeaf,
  getSphinxManager,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
} from '@sphinx/core'
import {
  AuthABI,
  PROPOSER_ROLE,
  PROJECT_MANAGER_ROLE,
  SphinxManagerABI,
} from '@sphinx/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'
import {
  DUMMY_ORG_ID,
  authAddress,
  cre,
  deployerAddress,
  isTestnet,
  ownerAddress,
  ownerPrivateKey,
  projectName,
  projectThreshold,
  rpcProviders,
  relayerPrivateKey,
  testnets,
  userConfig,
} from './constants'

export const setupThenApproveDeploymentWithSingleOwner = async () => {
  const prevOrgConfig = getEmptyCanonicalOrgConfig(
    testnets.map((network) => SUPPORTED_NETWORKS[network]),
    deployerAddress,
    DUMMY_ORG_ID,
    projectName
  )
  const leafs = await getAuthLeafs(
    userConfig,
    prevOrgConfig,
    rpcProviders,
    projectName,
    deployerAddress,
    testnets,
    isTestnet,
    cre,
    makeGetConfigArtifacts(hre)
  )

  const expectedNumLeafsPerChain = 4
  await setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute(
    leafs,
    testnets,
    expectedNumLeafsPerChain
  )
}

export const setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute =
  async (
    leafs: Array<AuthLeaf>,
    networks: Array<string>,
    expectedNumLeafsPerChain: number
  ) => {
    const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

    for (const network of networks) {
      const provider = rpcProviders[network]

      const owner = new ethers.Wallet(ownerPrivateKey, provider)
      // The relayer is the signer that executes the transactions on the Auth contract
      const relayer = new ethers.Wallet(relayerPrivateKey, provider)

      const Deployer = new ethers.Contract(
        deployerAddress,
        SphinxManagerABI,
        relayer
      )
      const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

      const chainId = SUPPORTED_NETWORKS[network]
      const signature = await signAuthRootMetaTxn(owner, root)

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

      await Auth.setup(root, setupLeaf, [signature], setupProof)

      // Check that the setup function executed correctly.
      expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(true)
      expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(
        true
      )
      let authState: AuthState = await Auth.authStates(root)
      expect(authState.status).equals(AuthStatus.SETUP)
      expect(authState.leafsExecuted).deep.equals(BigNumber.from(1))
      expect(authState.numLeafs).deep.equals(
        BigNumber.from(expectedNumLeafsPerChain)
      )

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

      // Execute the deployment.
      const { gasLimit: blockGasLimit } = await provider.getBlock('latest')
      const deployer = getSphinxManager(deployerAddress, relayer)

      await Deployer.claimDeployment()
      const success = await executeDeployment(
        deployer,
        bundles,
        blockGasLimit,
        configArtifacts[projectName],
        provider
      )

      // Check that the deployment executed correctly.
      expect(success).equals(true)
      const deployment: DeploymentState = await Deployer.deployments(
        deploymentId
      )
      expect(deployment.status).equals(DeploymentStatus.COMPLETED)
    }
  }
