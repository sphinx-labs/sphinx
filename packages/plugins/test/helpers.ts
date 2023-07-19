import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AuthState,
  AuthStatus,
  getParsedOrgConfig,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  findProposalRequestLeaf,
  getSphinxManager,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
  UserSphinxConfig,
  proposeAbstractTask,
  CanonicalOrgConfig,
  GetCanonicalOrgConfig,
  fromProposalRequestLeafToRawAuthLeaf,
} from '@sphinx/core'
import {
  AuthABI,
  PROPOSER_ROLE,
  PROJECT_MANAGER_ROLE,
  SphinxManagerABI,
} from '@sphinx/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import {
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../src/hardhat/artifacts'
import {
  authAddress,
  cre,
  deployerAddress,
  ownerAddress,
  ownerPrivateKey,
  sampleProjectName,
  sampleProjectThreshold,
  rpcProviders,
  relayerPrivateKey,
  testnets,
  sampleUserConfig,
} from './constants'

export const setupThenApproveDeploymentWithSingleOwner = async () => {
  const expectedNumLeafsPerChain = 4
  await setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute(
    sampleUserConfig,
    sampleProjectName,
    testnets,
    expectedNumLeafsPerChain,
    emptyCanonicalOrgConfigCallback
  )
}

/**
 * @notice This is a callback function that is passed into the `proposeAbstractTask` function.
 * It must adhere to the `GetCanonicalOrgConfig` function type.
 */
export const emptyCanonicalOrgConfigCallback = async (
  orgId: string,
  isTestnet: boolean,
  apiKey: string
): Promise<CanonicalOrgConfig | undefined> => {
  // We write these variables here to avoid a TypeScript error.
  orgId
  isTestnet
  apiKey

  return undefined
}

export const setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute =
  async (
    userConfig: UserSphinxConfig,
    projectName: string,
    networks: Array<string>,
    expectedNumLeafsPerChain: number,
    getCanonicalOrgConfig: GetCanonicalOrgConfig
  ) => {
    const proposalRequest = await proposeAbstractTask(
      userConfig,
      true,
      projectName,
      true, // Enable dry run to avoid sending an API request to the back-end
      cre,
      makeGetConfigArtifacts(hre),
      makeGetProviderFromChainId(hre),
      undefined, // Use the default spinner
      undefined, // Use the default FailureAction
      getCanonicalOrgConfig
    )
    const { root, leaves } = proposalRequest.orgTree

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

      const setupLeaf = findProposalRequestLeaf(leaves, 0, chainId)
      const proposalLeaf = findProposalRequestLeaf(leaves, 1, chainId)
      const createProjectLeaf = findProposalRequestLeaf(leaves, 2, chainId)
      const approveDeploymentLeaf = findProposalRequestLeaf(leaves, 3, chainId)

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

      await Auth.setup(
        root,
        fromProposalRequestLeafToRawAuthLeaf(setupLeaf),
        [signature],
        setupLeaf.siblings
      )

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

      await Auth.propose(
        root,
        fromProposalRequestLeafToRawAuthLeaf(proposalLeaf),
        [signature],
        proposalLeaf.siblings
      )

      // Check that the proposal executed correctly.
      authState = await Auth.authStates(root)
      expect(authState.status).equals(AuthStatus.PROPOSED)
      expect(authState.leafsExecuted).deep.equals(BigNumber.from(2))
      expect(await Auth.firstProposalOccurred()).equals(true)

      await Auth.createProject(
        root,
        fromProposalRequestLeafToRawAuthLeaf(createProjectLeaf),
        [signature],
        createProjectLeaf.siblings
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
        BigNumber.from(sampleProjectThreshold)
      )
      expect(authState.leafsExecuted).deep.equals(BigNumber.from(3))

      // Check that there is no active deployment before approving the deployment.
      expect(await Deployer.activeDeploymentId()).equals(
        ethers.constants.HashZero
      )

      await Auth.approveDeployment(
        root,
        fromProposalRequestLeafToRawAuthLeaf(approveDeploymentLeaf),
        [signature],
        approveDeploymentLeaf.siblings
      )

      // Check that the approve function executed correctly and that all of the leafs in the tree have
      // been executed.
      const { parsedConfig, configCache, configArtifacts } =
        await getParsedOrgConfig(
          userConfig,
          projectName,
          deployerAddress,
          true,
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
