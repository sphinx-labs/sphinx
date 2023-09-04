import hre from 'hardhat'
import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `compilerConfigPath`
import '@nomicfoundation/hardhat-ethers'
import {
  ensureSphinxInitialized,
  getParsedConfigWithOptions,
  GetCanonicalConfig,
  proposeAbstractTask,
  doDeterministicDeploy,
  getSphinxRegistryAddress,
  DEFAULT_CREATE3_ADDRESS,
  getManagedServiceAddress,
  getSphinxRegistry,
  getGasPriceOverrides,
  getImpersonatedSigner,
  AUTH_FACTORY_ADDRESS,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  AuthABI,
  AuthArtifact,
  AuthFactoryABI,
  EXECUTION_LOCK_TIME,
  OWNER_MULTISIG_ADDRESS,
  SphinxManagerABI,
  SphinxManagerArtifact,
} from '@sphinx-labs/contracts'

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
  defaultCre,
  rpcProviders,
  relayerPrivateKey,
  initialTestnets,
  testnetsToAdd,
  multichainTestInfo,
  proposerPrivateKey,
  allTestnets,
  executionMethods,
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

      const owner = await getImpersonatedSigner(
        OWNER_MULTISIG_ADDRESS,
        provider
      )

      // Deploy new auth and manager implementations on all chains for testing upgrades
      const NewManagerImplementation = await doDeterministicDeploy(provider, {
        signer: owner,
        contract: {
          abi: SphinxManagerABI,
          bytecode: SphinxManagerArtifact.bytecode,
        },
        args: [
          getSphinxRegistryAddress(),
          DEFAULT_CREATE3_ADDRESS,
          getManagedServiceAddress(
            Number((await provider.getNetwork()).chainId)
          ),
          EXECUTION_LOCK_TIME,
          [9, 9, 9],
        ],
        salt: ethers.ZeroHash,
      })

      const NewAuthImplementation = await doDeterministicDeploy(provider, {
        signer: owner,
        contract: {
          abi: AuthABI,
          bytecode: AuthArtifact.bytecode,
        },
        args: [[9, 9, 9]],
        salt: ethers.ZeroHash,
      })

      // Add new implementations as valid versions on the registry
      const SphinxRegistry = getSphinxRegistry(owner)
      await (
        await SphinxRegistry.addVersion(
          await NewManagerImplementation.getAddress(),
          await getGasPriceOverrides(provider)
        )
      ).wait()

      const AuthFactory = new ethers.Contract(
        AUTH_FACTORY_ADDRESS,
        AuthFactoryABI,
        owner
      )
      await (
        await AuthFactory.addVersion(
          await NewAuthImplementation.getAddress(),
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
  })

  const snapshotIds: {
    [network: string]: string
  } = {}
  beforeEach(async () => {
    await revertSnapshots(allTestnets, snapshotIds)
  })

  for (const executionMethod of executionMethods) {
    for (const projectTestInfo of multichainTestInfo) {
      const { projectName } = projectTestInfo.userConfig
      describe(`${projectName} with execution method: ${executionMethod}`, () => {
        const { managerAddress, authAddress, userConfig } = projectTestInfo

        it('Setup -> Propose -> Approve -> Execute', async () => {
          await setupThenProposeThenApproveDeploymentThenExecute(
            projectTestInfo,
            initialTestnets,
            emptyCanonicalConfigCallback,
            executionMethod
          )
        })

        describe('After contract deployment has been executed', () => {
          let getCanonicalConfig: GetCanonicalConfig
          beforeEach(async () => {
            await setupThenProposeThenApproveDeploymentThenExecute(
              projectTestInfo,
              initialTestnets,
              emptyCanonicalConfigCallback,
              executionMethod
            )

            // Get the previous parsed config, which we will convert into a CanonicalConfig. We can use
            // a randomly selected provider here because the parsed config doesn't change across networks.
            const { parsedConfig: prevParsedConfig } =
              await getParsedConfigWithOptions(
                userConfig,
                managerAddress,
                true,
                Object.values(rpcProviders)[0], // Use a random provider
                defaultCre,
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
            newProjectTestInfo.userConfig.contracts['ConfigContract2'] = {
              contract: 'MyContract1',
              kind: 'immutable',
              constructorArgs: {
                _intArg: 3,
                _uintArg: 4,
                _addressArg: '0x' + '33'.repeat(20),
                _otherAddressArg: '0x' + '44'.repeat(20),
              },
            }

            const { proposalRequest } = await proposeAbstractTask(
              newProjectTestInfo.userConfig,
              true,
              defaultCre,
              true, // Skip relaying the meta transaction to the back-end
              getConfigArtifacts,
              getProviderFromChainId,
              undefined, // Use the default spinner
              undefined, // Use the default FailureAction
              getCanonicalConfig
            )

            await proposeThenApproveDeploymentThenExecute(
              newProjectTestInfo,
              proposalRequest!,
              initialTestnets,
              executionMethod
            )
          })

          it('Deploy existing project on new chains', async () => {
            // Make a copy of the test info to avoid mutating the original object, which would impact
            // other tests.
            const newProjectTestInfo = structuredClone(projectTestInfo)

            newProjectTestInfo.userConfig.options.testnets.push(
              ...testnetsToAdd
            )

            await setupThenProposeThenApproveDeploymentThenExecute(
              newProjectTestInfo,
              testnetsToAdd,
              getCanonicalConfig,
              executionMethod
            )
          })

          it('Add contract to config -> Upgrade to new manager and auth impl -> Deploy project on new and existing chains', async () => {
            // Add a new contract to the config.
            const newProjectTestInfo = structuredClone(projectTestInfo)

            // We use the 'any type because a TypeScript type error would be thrown otherwise. It's
            // not an issue for us to set this to 'v9.9.9' because we use an environment variable to
            // make the test version count as valid.
            newProjectTestInfo.userConfig.options.managerVersion =
              'v9.9.9' as any

            newProjectTestInfo.userConfig.options.testnets.push(
              ...testnetsToAdd
            )
            newProjectTestInfo.userConfig.contracts['ConfigContract2'] = {
              contract: 'MyContract1',
              kind: 'immutable',
              constructorArgs: {
                _intArg: 3,
                _uintArg: 4,
                _addressArg: '0x' + '33'.repeat(20),
                _otherAddressArg: '0x' + '44'.repeat(20),
              },
            }

            // Setup then deploy the project on the new chains.
            await setupThenProposeThenApproveDeploymentThenExecute(
              newProjectTestInfo,
              testnetsToAdd,
              getCanonicalConfig,
              executionMethod
            )

            // Deploy the project on the existing chains.
            const { proposalRequest } = await proposeAbstractTask(
              newProjectTestInfo.userConfig,
              true,
              defaultCre,
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
              initialTestnets,
              executionMethod
            )
          })
        })
      })
    }
  }
})
