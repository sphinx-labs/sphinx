import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `compilerConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AuthState,
  AuthStatus,
  getParsedConfigWithOptions,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  findProposalRequestLeaf,
  getSphinxManager,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
  proposeAbstractTask,
  fromProposalRequestLeafToRawAuthLeaf,
  UserConfigWithOptions,
  CanonicalConfig,
  GetCanonicalConfig,
} from '@sphinx-labs/core'
import {
  AuthABI,
  PROPOSER_ROLE,
  SphinxManagerABI,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import {
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../src/hardhat/artifacts'
import {
  authAddress,
  cre,
  managerAddress,
  ownerAddress,
  ownerPrivateKey,
  rpcProviders,
  relayerPrivateKey,
  testnets,
  sampleUserConfig,
} from './constants'

export const setupThenApproveDeploymentWithSingleOwner = async () => {
  const expectedNumLeafsPerChain = 3
  await setupThenProposeThenApproveDeploymentThenExecute(
    sampleUserConfig,
    testnets,
    expectedNumLeafsPerChain,
    emptyCanonicalConfigCallback
  )
}

/**
 * @notice This is a callback function that is passed into the `proposeAbstractTask` function.
 * It must adhere to the `GetCanonicalConfig` function type.
 */
export const emptyCanonicalConfigCallback = async (
  orgId: string,
  isTestnet: boolean,
  apiKey: string
): Promise<CanonicalConfig | undefined> => {
  // We write these variables here to avoid a TypeScript error.
  orgId
  isTestnet
  apiKey

  return undefined
}

export const setupThenProposeThenApproveDeploymentThenExecute = async (
  userConfig: UserConfigWithOptions,
  networks: Array<string>,
  expectedNumLeafsPerChain: number,
  getCanonicalConfig: GetCanonicalConfig
) => {
  const proposalRequest = await proposeAbstractTask(
    userConfig,
    true,
    cre,
    true, // Dry run the proposal so it isn't sent to the back-end
    makeGetConfigArtifacts(hre),
    makeGetProviderFromChainId(hre),
    undefined, // Use the default spinner
    undefined, // Use the default FailureAction
    getCanonicalConfig
  )
  const { root, leaves } = proposalRequest.tree

  for (const network of networks) {
    const provider = rpcProviders[network]

    const owner = new ethers.Wallet(ownerPrivateKey, provider)
    // The relayer is the signer that executes the transactions on the Auth contract
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Manager = new ethers.Contract(
      managerAddress,
      SphinxManagerABI,
      relayer
    )
    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    const chainId = SUPPORTED_NETWORKS[network]
    const signature = await signAuthRootMetaTxn(owner, root)

    const setupLeaf = findProposalRequestLeaf(leaves, 0, chainId)
    const proposalLeaf = findProposalRequestLeaf(leaves, 1, chainId)
    const approveDeploymentLeaf = findProposalRequestLeaf(leaves, 2, chainId)

    // Check that the state of the Auth contract is correct before calling the `setup` function.
    expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(false)
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

    await Auth.approveDeployment(
      root,
      fromProposalRequestLeafToRawAuthLeaf(approveDeploymentLeaf),
      [signature],
      approveDeploymentLeaf.siblings
    )

    // Check that the approve function executed correctly and that all of the leafs in the tree have
    // been executed.
    const { parsedConfig, configCache, configArtifacts } =
      await getParsedConfigWithOptions(
        userConfig,
        managerAddress,
        true,
        provider,
        cre,
        makeGetConfigArtifacts(hre)
      )
    const { configUri, bundles } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts,
      configCache
    )
    const deploymentId = getDeploymentId(bundles, configUri)
    expect(await Manager.activeDeploymentId()).equals(deploymentId)
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.COMPLETED)

    // Execute the deployment.
    const { gasLimit: blockGasLimit } = await provider.getBlock('latest')
    const manager = getSphinxManager(managerAddress, relayer)

    await Manager.claimDeployment()
    const { success } = await executeDeployment(
      manager,
      bundles,
      blockGasLimit,
      configArtifacts,
      provider
    )

    // Check that the deployment executed correctly.
    expect(success).equals(true)
    const deployment: DeploymentState = await Manager.deployments(deploymentId)
    expect(deployment.status).equals(DeploymentStatus.COMPLETED)
  }
}
