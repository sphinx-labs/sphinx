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
  proposeThenApproveDeployment,
  registerProject,
  setupThenProposeThenApproveDeployment,
  revertSnapshots,
  execute,
  executeRevertingDeployment,
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
          await getGasPriceOverrides(owner)
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
          await getGasPriceOverrides(owner)
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
        it('Setup -> Propose -> Approve -> Execute', async () => {
          await setupThenProposeThenApproveDeployment(
            projectTestInfo,
            initialTestnets,
            emptyCanonicalConfigCallback,
            executionMethod
          )
          await execute(projectTestInfo, initialTestnets)
        })

        describe('After contract deployment has been executed', () => {
          let getCanonicalConfig: GetCanonicalConfig
          beforeEach(async () => {
            await setupThenProposeThenApproveDeployment(
              projectTestInfo,
              initialTestnets,
              emptyCanonicalConfigCallback,
              executionMethod
            )
            await execute(projectTestInfo, initialTestnets)

            // Get the previous parsed config, which we will convert into a CanonicalConfig. We can use
            // a randomly selected provider here because the parsed config doesn't change across networks.
            const { parsedConfig: prevParsedConfig } =
              await getParsedConfigWithOptions(
                projectTestInfo.userConfig,
                projectTestInfo.managerAddress,
                true,
                Object.values(rpcProviders)[0], // Use a random provider
                defaultCre,
                makeGetConfigArtifacts(hre)
              )

            getCanonicalConfig = makeGetCanonicalConfig(
              prevParsedConfig,
              projectTestInfo.managerAddress,
              projectTestInfo.authAddress,
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

            await proposeThenApproveDeployment(
              newProjectTestInfo,
              proposalRequest!,
              initialTestnets,
              executionMethod
            )
            await execute(newProjectTestInfo, initialTestnets)
          })

          it('Deploy existing project on new chains', async () => {
            // Make a copy of the test info to avoid mutating the original object, which would impact
            // other tests.
            const newProjectTestInfo = structuredClone(projectTestInfo)

            newProjectTestInfo.userConfig.options.testnets.push(
              ...testnetsToAdd
            )

            await setupThenProposeThenApproveDeployment(
              newProjectTestInfo,
              testnetsToAdd,
              getCanonicalConfig,
              executionMethod
            )
            await execute(newProjectTestInfo, testnetsToAdd)
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
            await setupThenProposeThenApproveDeployment(
              newProjectTestInfo,
              testnetsToAdd,
              getCanonicalConfig,
              executionMethod
            )
            await execute(newProjectTestInfo, testnetsToAdd)

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
            await proposeThenApproveDeployment(
              newProjectTestInfo,
              proposalRequest,
              initialTestnets,
              executionMethod
            )
            await execute(newProjectTestInfo, initialTestnets)
          })
        })

        it('Cancel existing deployment then execute new deployment', async () => {
          // Set an environment variable to bypass the validation logic that checks for reverting
          // constructors. This is necessary because we want to test reverting constructors in this
          // test suite.
          process.env['SPHINX_INTERNAL__ALLOW_REVERTING_CONSTRUCTORS'] = 'true'

          const newProjectTestInfo = structuredClone(projectTestInfo)

          // Add a new contract that will revert during execution.
          newProjectTestInfo.userConfig.contracts['Reverter'] = {
            contract: 'Reverter',
            kind: 'immutable',
          }

          await setupThenProposeThenApproveDeployment(
            newProjectTestInfo,
            initialTestnets,
            emptyCanonicalConfigCallback,
            executionMethod
          )
          await executeRevertingDeployment(newProjectTestInfo, initialTestnets)

          // Get the previous parsed config, which we will convert into a CanonicalConfig. We can use
          // a randomly selected provider here because the parsed config doesn't change across networks.
          const { parsedConfig: prevParsedConfig } =
            await getParsedConfigWithOptions(
              newProjectTestInfo.userConfig,
              newProjectTestInfo.managerAddress,
              true,
              Object.values(rpcProviders)[0], // Use a random provider
              defaultCre,
              makeGetConfigArtifacts(hre)
            )

          const getCanonicalConfig = makeGetCanonicalConfig(
            prevParsedConfig,
            newProjectTestInfo.managerAddress,
            newProjectTestInfo.authAddress,
            rpcProviders
          )

          // Delete the contract that reverts.
          delete newProjectTestInfo.userConfig.contracts['Reverter']

          // Create a new proposal request with a config that will not revert.
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

          // Narrows the TypeScript type of the proposal request object.
          if (!proposalRequest) {
            throw new Error(
              `Could not get proposal request. Should never happen.`
            )
          }

          await proposeThenApproveDeployment(
            newProjectTestInfo,
            proposalRequest,
            initialTestnets,
            executionMethod
          )
          await execute(newProjectTestInfo, initialTestnets)
        })
      })
    }
  }
})
