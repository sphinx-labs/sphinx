import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `compilerConfigPath`
import '@nomicfoundation/hardhat-ethers'
import {
  ensureSphinxInitialized,
  getParsedConfigWithOptions,
  GetCanonicalConfig,
  proposeAbstractTask,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import {
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../src/hardhat/artifacts'
import {
  emptyCanonicalConfigCallback,
  makeGetCanonicalConfig,
  proposeThenApproveDeploymentThenExecute,
  registerProject,
  setupThenProposeThenApproveDeploymentThenExecute,
  revertSnapshots,
} from './helpers'
import {
  cre,
  rpcProviders,
  relayerPrivateKey,
  initialTestnets,
  testnetsToAdd,
  multichainTestInfo,
  proposerPrivateKey,
  allTestnets,
} from './constants'

const getConfigArtifacts = makeGetConfigArtifacts(hre)
const getProviderFromChainId = makeGetProviderFromChainId(hre)

describe('Multi chain projects', () => {
  before(async () => {
    process.env['PROPOSER_PRIVATE_KEY'] = proposerPrivateKey

    for (const provider of Object.values(rpcProviders)) {
      const relayerAndExecutor = new ethers.Wallet(relayerPrivateKey, provider)

      // Initialize the Sphinx contracts including an executor so that it's possible to execute
      // the project deployments.
      await ensureSphinxInitialized(provider, relayerAndExecutor, [
        relayerAndExecutor.address,
      ])

      for (const projectTestInfo of multichainTestInfo) {
        await registerProject(provider, projectTestInfo)
      }
    }
  })

  const snapshotIds: {
    [network: string]: string
  } = {}
  beforeEach(async () => {
    await revertSnapshots(allTestnets, snapshotIds)
  })

  for (const projectTestInfo of multichainTestInfo) {
    const { projectName } = projectTestInfo.userConfig
    describe(projectName, () => {
      const { managerAddress, authAddress, userConfig } = projectTestInfo

      it('Setup -> Propose -> Approve -> Execute', async () => {
        await setupThenProposeThenApproveDeploymentThenExecute(
          projectTestInfo,
          initialTestnets,
          emptyCanonicalConfigCallback
        )
      })

      describe('After contract deployment has been executed', () => {
        let getCanonicalConfig: GetCanonicalConfig
        beforeEach(async () => {
          await setupThenProposeThenApproveDeploymentThenExecute(
            projectTestInfo,
            initialTestnets,
            emptyCanonicalConfigCallback
          )

          // Get the previous parsed config, which we will convert into a CanonicalConfig. We can use
          // a randomly selected provider here because the parsed config doesn't change across networks.
          const { parsedConfig: prevParsedConfig } =
            await getParsedConfigWithOptions(
              userConfig,
              managerAddress,
              true,
              Object.values(rpcProviders)[0], // Use a random provider
              cre,
              makeGetConfigArtifacts(hre)
            )

          getCanonicalConfig = makeGetCanonicalConfig(
            prevParsedConfig,
            managerAddress,
            authAddress,
            rpcProviders
          )
        })

        it('Add contract to config -> Propose -> Approve deployment -> Execute deployment', async () => {
          // Make a copy of the test info to avoid mutating the original object, which would impact
          // other tests.
          const newProjectTestInfo = structuredClone(projectTestInfo)

          // Add a new contract to the config.
          newProjectTestInfo.userConfig.contracts['MyContract2'] = {
            contract: 'Stateless',
            kind: 'immutable',
            constructorArgs: {
              _immutableUint: 2,
              _immutableAddress: '0x' + '22'.repeat(20),
            },
          }

          const proposalRequest = await proposeAbstractTask(
            newProjectTestInfo.userConfig,
            true,
            cre,
            true, // Skip relaying the meta transaction to the back-end
            getConfigArtifacts,
            getProviderFromChainId,
            undefined, // Use the default spinner
            undefined, // Use the default FailureAction
            getCanonicalConfig
          )

          if (!proposalRequest) {
            throw new Error('The proposal is empty. Should never happen.')
          }

          await proposeThenApproveDeploymentThenExecute(
            newProjectTestInfo,
            proposalRequest,
            initialTestnets
          )
        })

        it('Deploy existing project on new chains', async () => {
          // Make a copy of the test info to avoid mutating the original object, which would impact
          // other tests.
          const newProjectTestInfo = structuredClone(projectTestInfo)

          newProjectTestInfo.userConfig.options.testnets.push(...testnetsToAdd)

          await setupThenProposeThenApproveDeploymentThenExecute(
            newProjectTestInfo,
            testnetsToAdd,
            getCanonicalConfig
          )
        })

        it('Add contract to config -> Deploy project on new and existing chains', async () => {
          // Add a new contract to the config.
          const newProjectTestInfo = structuredClone(projectTestInfo)

          newProjectTestInfo.userConfig.options.testnets.push(...testnetsToAdd)
          newProjectTestInfo.userConfig.contracts['MyContract2'] = {
            contract: 'Stateless',
            kind: 'immutable',
            constructorArgs: {
              _immutableUint: 2,
              _immutableAddress: '0x' + '22'.repeat(20),
            },
          }

          // Setup then deploy the project on the new chains.
          await setupThenProposeThenApproveDeploymentThenExecute(
            newProjectTestInfo,
            testnetsToAdd,
            getCanonicalConfig
          )

          // Deploy the project on the existing chains.
          const proposalRequest = await proposeAbstractTask(
            newProjectTestInfo.userConfig,
            true,
            cre,
            true, // Skip relaying the meta transaction to the back-end
            getConfigArtifacts,
            getProviderFromChainId,
            undefined, // Use the default spinner
            undefined, // Use the default FailureAction
            getCanonicalConfig
          )
          if (!proposalRequest) {
            throw new Error('The proposal is empty. Should never happen.')
          }
          await proposeThenApproveDeploymentThenExecute(
            newProjectTestInfo,
            proposalRequest,
            initialTestnets
          )
        })
      })
    })
  }
})
