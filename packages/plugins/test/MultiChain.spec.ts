import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `compilerConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  AuthState,
  AuthStatus,
  ensureSphinxInitialized,
  getParsedConfigWithOptions,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
  CanonicalConfig,
  toCanonicalConfig,
  GetCanonicalConfig,
  proposeAbstractTask,
  findProposalRequestLeaf,
  fromProposalRequestLeafToRawAuthLeaf,
} from '@sphinx-labs/core'
import {
  AuthFactoryABI,
  AuthABI,
  SphinxManagerABI,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import {
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../src/hardhat/artifacts'
import {
  setupThenApproveDeploymentWithSingleOwner,
  setupThenProposeThenApproveDeploymentThenExecute,
} from './helpers'
import {
  OWNER_ROLE_HASH,
  authAddress,
  authData,
  cre,
  managerAddress,
  owners,
  ownerThreshold,
  ownerPrivateKey,
  sampleProjectName,
  rpcProviders,
  relayerPrivateKey,
  testnets,
  sampleUserConfig,
} from './constants'

describe('Multi chain config', () => {
  before(async () => {
    for (const provider of Object.values(rpcProviders)) {
      const relayerAndExecutor = new ethers.Wallet(relayerPrivateKey, provider)
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
      await AuthFactory.deploy(authData, [], sampleProjectName)

      // Check that the Auth contract has been initialized correctly.
      expect(await Auth.threshold()).deep.equals(BigNumber.from(ownerThreshold))
      expect(await Auth.getRoleMemberCount(OWNER_ROLE_HASH)).deep.equals(
        BigNumber.from(1)
      )
      expect(await Auth.hasRole(OWNER_ROLE_HASH, owners[0])).equals(true)
    }
  })

  const snapshotIds: {
    [network: string]: string
  } = {}
  beforeEach(async () => {
    // Revert to a snapshot of the blockchain state before each test. The snapshot is taken after
    // the `before` hook above is run.
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
    'Setup -> Propose -> Approve deployment',
    setupThenApproveDeploymentWithSingleOwner
  )

  describe('After contract deployment has been executed', () => {
    let getCanonicalConfig: GetCanonicalConfig
    beforeEach(async () => {
      await setupThenApproveDeploymentWithSingleOwner()

      // Get the previous parsed config, which we will convert into a CanonicalConfig. We can use
      // a randomly selected provider here because the parsed config doesn't change across networks.
      const { parsedConfig: prevParsedConfig } =
        await getParsedConfigWithOptions(
          sampleUserConfig,
          managerAddress,
          true,
          Object.values(rpcProviders)[0], // Use a random provider
          cre,
          makeGetConfigArtifacts(hre)
        )

      getCanonicalConfig = async (
        orgId: string,
        isTestnet: boolean,
        apiKey: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _projectName: string
      ): Promise<CanonicalConfig | undefined> => {
        // We write these variables here to avoid a TypeScript error.
        orgId
        isTestnet
        apiKey

        // Convert the previous parsed config into a CanonicalConfig.
        return toCanonicalConfig(
          prevParsedConfig,
          managerAddress,
          authAddress,
          rpcProviders
        )
      }
    })

    it('Add contract to config -> Propose -> Approve deployment -> Execute deployment', async () => {
      // Make a copy of the user config to avoid mutating the original object, which would impact
      // other tests.
      const newUserConfig = structuredClone(sampleUserConfig)

      // Add a new contract to the config.
      newUserConfig.contracts['MyContract2'] = {
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
        cre,
        true, // Dry run the proposal so it isn't sent to the back-end
        makeGetConfigArtifacts(hre),
        makeGetProviderFromChainId(hre),
        undefined, // Use the default spinner
        undefined, // Use the default FailureAction
        getCanonicalConfig
      )
      const { root, leaves } = proposalRequest.tree

      // There will be a proposal leaf and an approval leaf for each chain.
      const expectedNumLeafsPerChain = 2

      for (const network of testnets) {
        const provider = rpcProviders[network]

        const owner = new ethers.Wallet(ownerPrivateKey, provider)
        // The relayer is the signer that executes the transactions on the Auth contract
        const relayer = new ethers.Wallet(relayerPrivateKey, provider)

        const Auth = new ethers.Contract(authAddress, AuthABI, relayer)
        const Manager = new ethers.Contract(
          managerAddress,
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
        expect(await Manager.activeDeploymentId()).equals(
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
          await getParsedConfigWithOptions(
            newUserConfig,
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
        await Manager.claimDeployment()
        const { success } = await executeDeployment(
          Manager,
          bundles,
          blockGasLimit,
          configArtifacts,
          provider
        )

        // Check that the deployment executed correctly.
        expect(success).equals(true)
        const deployment: DeploymentState = await Manager.deployments(
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

      options.testnets.push('gnosis-chiado')
      options.testnets.push('arbitrum-goerli')

      await setupThenProposeThenApproveDeploymentThenExecute(
        newUserConfig,
        ['gnosis-chiado', 'arbitrum-goerli'],
        3,
        getCanonicalConfig
      )
    })
  })
})
