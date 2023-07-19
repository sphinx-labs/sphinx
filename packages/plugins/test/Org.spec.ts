import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  AuthState,
  AuthStatus,
  ensureSphinxInitialized,
  getParsedOrgConfig,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
  CanonicalOrgConfig,
  toCanonicalOrgConfig,
  GetCanonicalOrgConfig,
  proposeAbstractTask,
  findProposalRequestLeaf,
  fromProposalRequestLeafToRawAuthLeaf,
} from '@sphinx/core'
import { AuthFactoryABI, AuthABI, SphinxManagerABI } from '@sphinx/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import {
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../src/hardhat/artifacts'
import {
  setupThenApproveDeploymentWithSingleOwner,
  setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute,
} from './helpers'
import {
  ORG_OWNER_ROLE_HASH,
  authAddress,
  authData,
  cre,
  deployerAddress,
  orgOwners,
  orgThreshold,
  ownerPrivateKey,
  sampleProjectName,
  rpcProviders,
  relayerPrivateKey,
  testnets,
  sampleUserConfig,
} from './constants'

describe('Org config', () => {
  before(async () => {
    for (const provider of Object.values(rpcProviders)) {
      const relayerAndExecutor = new ethers.Wallet(relayerPrivateKey, provider)
      const owner = new ethers.Wallet(ownerPrivateKey, provider)
      // Initialize the Sphinx contracts including an executor so that it's possible to execute
      // the project deployments.
      await ensureSphinxInitialized(provider, relayerAndExecutor, [
        relayerAndExecutor.address,
      ])

      const AuthFactory = new ethers.Contract(
        AUTH_FACTORY_ADDRESS,
        AuthFactoryABI,
        relayerAndExecutor
      )
      const Auth = new ethers.Contract(authAddress, AuthABI, relayerAndExecutor)

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
    }
  })

  const snapshotIds: {
    [network: string]: string
  } = {}
  beforeEach(async () => {
    // Revert to a snapshot of the blockchain before each test. The snapshot is taken after the
    // `before` hook above is run.
    for (const network of testnets) {
      const provider = rpcProviders[network]

      const snapshotId = snapshotIds[network]
      // Attempt to revert to the previous snapshot.
      try {
        await provider.send('evm_revert', [snapshotId])
      } catch (e) {
        // An error will be thrown when this `beforeEach` hook is run for the first time. This is
        // because there is no `snapshotId` yet. We can ignore this error.
      }

      const newSnapshotId = await provider.send('evm_snapshot', [])
      snapshotIds[network] = newSnapshotId
    }
  })

  it(
    'Setup -> Propose -> Create project -> Approve deployment',
    setupThenApproveDeploymentWithSingleOwner
  )

  describe('After project has been executed', () => {
    let getCanonicalOrgConfig: GetCanonicalOrgConfig
    beforeEach(async () => {
      await setupThenApproveDeploymentWithSingleOwner()

      // Get the previous parsed config, which we will convert into a CanonicalOrgConfig. We can use
      // a randomly selected provider here because the parsed config doesn't change across networks.
      const { parsedConfig: prevParsedConfig } = await getParsedOrgConfig(
        sampleUserConfig,
        sampleProjectName,
        deployerAddress,
        true,
        Object.values(rpcProviders)[0], // Use a random provider
        cre,
        makeGetConfigArtifacts(hre)
      )

      getCanonicalOrgConfig = async (
        orgId: string,
        isTestnet: boolean,
        apiKey: string
      ): Promise<CanonicalOrgConfig | undefined> => {
        // We write these variables here to avoid a TypeScript error.
        orgId
        isTestnet
        apiKey

        // Convert the previous parsed config into a CanonicalOrgConfig.
        return toCanonicalOrgConfig(
          prevParsedConfig,
          deployerAddress,
          authAddress,
          rpcProviders
        )
      }
    })

    it('Add contract to project config -> Propose -> Approve deployment -> Execute deployment', async () => {
      // Make a copy of the user config to avoid mutating the original object, which would impact
      // other tests.
      const newUserConfig = structuredClone(sampleUserConfig)

      // Add a new contract to the project config.
      newUserConfig.projects[sampleProjectName].contracts['MyContract2'] = {
        contract: 'Stateless',
        kind: 'immutable',
        constructorArgs: {
          _immutableUint: 2,
          _immutableAddress: '0x' + '22'.repeat(20),
        },
      }

      const proposalRequest = await proposeAbstractTask(
        newUserConfig,
        true,
        sampleProjectName,
        true, // Enable dry run to avoid sending an API request to the back-end
        cre,
        makeGetConfigArtifacts(hre),
        makeGetProviderFromChainId(hre),
        undefined, // Use the default spinner
        undefined, // Use the default FailureAction
        getCanonicalOrgConfig
      )
      const { root, leaves } = proposalRequest.orgTree

      // There will be a proposal leaf and an approval leaf for each chain.
      const expectedNumLeafsPerChain = 2

      for (const network of testnets) {
        const provider = rpcProviders[network]

        const owner = new ethers.Wallet(ownerPrivateKey, provider)
        // The relayer is the signer that executes the transactions on the Auth contract
        const relayer = new ethers.Wallet(relayerPrivateKey, provider)

        const Auth = new ethers.Contract(authAddress, AuthABI, relayer)
        const Deployer = new ethers.Contract(
          deployerAddress,
          SphinxManagerABI,
          relayer
        )

        const chainId = SUPPORTED_NETWORKS[network]
        const signature = await signAuthRootMetaTxn(owner, root)

        const proposalLeaf = findProposalRequestLeaf(leaves, 0, chainId)
        const approvalLeaf = findProposalRequestLeaf(leaves, 1, chainId)

        // Check that the state of the Auth bundle is correct before calling the `propose` function.
        let authState: AuthState = await Auth.authStates(root)
        expect(authState.status).equals(AuthStatus.EMPTY)

        await Auth.propose(
          root,
          fromProposalRequestLeafToRawAuthLeaf(proposalLeaf),
          [signature],
          proposalLeaf.siblings
        )

        // Check that the proposal executed correctly.
        authState = await Auth.authStates(root)
        expect(authState.status).equals(AuthStatus.PROPOSED)
        expect(authState.numLeafs).deep.equals(
          BigNumber.from(expectedNumLeafsPerChain)
        )
        expect(authState.leafsExecuted).deep.equals(BigNumber.from(1))

        // Check that there is no active deployment before approving the deployment.
        expect(await Deployer.activeDeploymentId()).equals(
          ethers.constants.HashZero
        )

        await Auth.approveDeployment(
          root,
          fromProposalRequestLeafToRawAuthLeaf(approvalLeaf),
          [signature],
          approvalLeaf.siblings
        )

        // Check that the approve function executed correctly and that all of the leafs in the tree have
        // been executed.
        const { parsedConfig, configCache, configArtifacts } =
          await getParsedOrgConfig(
            newUserConfig,
            sampleProjectName,
            deployerAddress,
            true,
            provider,
            cre,
            makeGetConfigArtifacts(hre)
          )
        const { configUri, bundles } = await getProjectBundleInfo(
          parsedConfig.projects[sampleProjectName],
          configArtifacts[sampleProjectName],
          configCache[sampleProjectName]
        )
        const deploymentId = getDeploymentId(
          bundles,
          configUri,
          sampleProjectName
        )
        expect(await Deployer.activeDeploymentId()).equals(deploymentId)
        authState = await Auth.authStates(root)
        expect(authState.status).equals(AuthStatus.COMPLETED)

        // Execute the deployment.
        const { gasLimit: blockGasLimit } = await provider.getBlock('latest')
        await Deployer.claimDeployment()
        const success = await executeDeployment(
          Deployer,
          bundles,
          blockGasLimit,
          configArtifacts[sampleProjectName],
          provider
        )

        // Check that the deployment executed correctly.
        expect(success).equals(true)
        const deployment: DeploymentState = await Deployer.deployments(
          deploymentId
        )
        expect(deployment.status).equals(DeploymentStatus.COMPLETED)
      }
    })

    it('Deploy existing project on new chains', async () => {
      // Make a copy of the user config to avoid mutating the original object, which would impact
      // other tests.
      const newUserConfig = structuredClone(sampleUserConfig)

      const { options } = newUserConfig

      // This removes a TypeScript error that occurs because TypeScript doesn't know that the
      // `options` variable is defined.
      if (!options) {
        throw new Error(`Options is not defined. Should never happen.`)
      }
      options.testnets.push('gnosis-chiado')
      options.testnets.push('arbitrum-goerli')

      await setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute(
        newUserConfig,
        sampleProjectName,
        ['gnosis-chiado', 'arbitrum-goerli'],
        4,
        getCanonicalOrgConfig
      )
    })
  })
})
