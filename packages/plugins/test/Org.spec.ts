import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  AuthState,
  AuthStatus,
  ensureSphinxInitialized,
  makeAuthBundle,
  getParsedOrgConfig,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  findBundledLeaf,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
  CanonicalOrgConfig,
  toCanonicalOrgConfig,
  getAuthLeafs,
} from '@sphinx/core'
import { AuthFactoryABI, AuthABI, SphinxManagerABI } from '@sphinx/contracts'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'

import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'
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
  isTestnet,
  orgOwners,
  orgThreshold,
  ownerPrivateKey,
  projectName,
  rpcProviders,
  relayerPrivateKey,
  testnets,
  userConfig,
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
    let prevOrgConfig: CanonicalOrgConfig
    beforeEach(async () => {
      await setupThenApproveDeploymentWithSingleOwner()

      // Get the previous parsed config, which we will convert into a CanonicalOrgConfig. We can use
      // a randomly selected provider here because the parsed config doesn't change across networks.
      const { parsedConfig: prevParsedConfig } = await getParsedOrgConfig(
        userConfig,
        projectName,
        deployerAddress,
        isTestnet,
        Object.values(rpcProviders)[0], // Use a random provider
        cre,
        makeGetConfigArtifacts(hre)
      )

      // Convert the previous parsed config into a CanonicalOrgConfig.
      prevOrgConfig = await toCanonicalOrgConfig(
        prevParsedConfig,
        deployerAddress,
        authAddress,
        rpcProviders
      )
    })

    it('Add contract to project config -> Propose -> Approve deployment -> Execute deployment', async () => {
      // Make a copy of the user config to avoid mutating the original object, which would impact
      // other tests.
      const newUserConfig = structuredClone(userConfig)

      // Add a new contract to the project config.
      newUserConfig.projects[projectName].contracts['MyContract2'] = {
        contract: 'Stateless',
        kind: 'immutable',
        constructorArgs: {
          _immutableUint: 2,
          _immutableAddress: '0x' + '22'.repeat(20),
        },
      }

      const leafs = await getAuthLeafs(
        newUserConfig,
        prevOrgConfig,
        rpcProviders,
        projectName,
        deployerAddress,
        testnets,
        isTestnet,
        cre,
        makeGetConfigArtifacts(hre)
      )

      const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

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

        const { leaf: proposalLeaf, proof: proposalProof } = findBundledLeaf(
          bundledLeafs,
          0,
          chainId
        )
        const { leaf: approvalLeaf, proof: approvalProof } = findBundledLeaf(
          bundledLeafs,
          1,
          chainId
        )

        // Check that the state of the Auth bundle is correct before calling the `propose` function.
        let authState: AuthState = await Auth.authStates(root)
        expect(authState.status).equals(AuthStatus.EMPTY)

        await Auth.propose(root, proposalLeaf, [signature], proposalProof)

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
          approvalLeaf,
          [signature],
          approvalProof
        )

        // Check that the approve function executed correctly and that all of the leafs in the tree have
        // been executed.
        const { parsedConfig, configCache, configArtifacts } =
          await getParsedOrgConfig(
            newUserConfig,
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
        await Deployer.claimDeployment()
        const success = await executeDeployment(
          Deployer,
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
    })

    it('Deploy existing project on new chains', async () => {
      // Make a copy of the user config to avoid mutating the original object, which would impact
      // other tests.
      const newUserConfig = structuredClone(userConfig)

      const { options } = newUserConfig

      // This removes a TypeScript error that occurs because TypeScript doesn't know that the
      // `options` variable is defined.
      if (!options) {
        throw new Error(`Options is not defined. Should never happen.`)
      }
      options.testnets.push('gnosis-chiado')
      options.testnets.push('arbitrum-goerli')

      const leafs = await getAuthLeafs(
        newUserConfig,
        prevOrgConfig,
        rpcProviders,
        projectName,
        deployerAddress,
        options.testnets,
        isTestnet,
        cre,
        makeGetConfigArtifacts(hre)
      )

      await setupThenProposeThenCreateProjectThenApproveDeploymentThenExecute(
        leafs,
        ['gnosis-chiado', 'arbitrum-goerli'],
        4
      )
    })
  })
})
