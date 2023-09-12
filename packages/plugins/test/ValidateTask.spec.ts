import { exec } from 'child_process'
import { writeFileSync } from 'fs'

import hre from 'hardhat'
import { expect } from 'chai'
import {
  ActionValidationResultType,
  Contract,
  FailureAction,
  SphinxFunctionSignature,
  SphinxJsonRpcProvider,
  SupportedChainId,
  TransactionValidation,
  UserConfig,
  ensureSphinxInitialized,
  execAsync,
  getParsedConfig,
  getProjectBundleInfo,
  validate,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { isExecutedActionValidationOutput } from '@sphinx-labs/core/src'

import { deploy, revertSnapshot } from './helpers'
import { defaultCre } from './constants'
import * as plugins from '../dist'

// TODO(docs): even though this tests logic defined in the core package, it's in the plugins package
// because...
// TODO(docs): if the validation logic is split up, you should say so

// TODO: add this test file to the plugins test suite

const alchemyApiKeyTODOLive = process.env.ALCHEMY_API_KEY
const liveDeployerPK = process.env.PRIVATE_KEY!

const provider = new SphinxJsonRpcProvider(
  `https://opt-goerli.g.alchemy.com/v2/${alchemyApiKeyTODOLive}`
)
const wallet = new ethers.Wallet(liveDeployerPK, provider)

describe('Validation', () => {
  let ownerAddress: string
  before(async () => {
    // await execAsync(`anvil --silent &`)
    ownerAddress = await wallet.getAddress()

    // await ensureSphinxInitialized(provider, wallet)
  })

  // let snapshotId: string = ''
  // beforeEach(async () => {
  //   snapshotId = await revertSnapshot(provider, snapshotId)
  // })

  it(
    'reverts if provider does not have the `debug_traceTransaction` rpc method'
  )

  it('returns empty output for empty config')

  // describe('Config has multiple contracts and no post-deployment actions')

  // describe('Config has no contracts and multiple post-deployment actions')

  // describe('Config has one contract and one post-deployment action')

  // TODO(docs): say somewhere that these tests rely on the source file of MyContract1 and MyContract2
  // being the same as they were when they were deployed. So, if you change the source file of one of these
  // contracts, at least one of the tests in this suite will fail.

  describe('Config has multiple contracts and multiple post-deployment actions', () => {
    const MyContractA = new Contract('{{ MyContractA }}')
    const MyContractB = new Contract('{{ MyContractB }}')
    const userConfig: UserConfig = {
      projectName: 'Validation Task Test',
      contracts: {
        MyContractA: {
          contract: 'MyContract1',
          kind: 'immutable',
          constructorArgs: {
            _intArg: 1,
            _uintArg: 2,
            _addressArg: '0x' + '11'.repeat(20),
            _otherAddressArg: '0x' + '22'.repeat(20),
          },
        },
        MyContractB: {
          contract: 'MyContract2',
          kind: 'immutable',
          constructorArgs: {},
        },
        MyContractC: {
          contract: 'MyContract1',
          kind: 'immutable',
          constructorArgs: {
            _intArg: 3,
            _uintArg: 4,
            _addressArg: '0x' + '33'.repeat(20),
            _otherAddressArg: '0x' + '44'.repeat(20),
          },
        },
        MyContractD: {
          contract: 'MyContract2',
          kind: 'immutable',
          constructorArgs: {},
        },
      },
      postDeploy: [
        MyContractA.incrementUint(),
        MyContractA.setInts(1, 2, 3),
        MyContractB.incrementMyContract2(1),
        MyContractB.incrementMyContract2(1),
        MyContractB.incrementMyContract2(2),
      ],
    }

    // TODO(docs): we generated the first config by setting the batch size to 1 in the
    // executeDeployment function. this way, multiple txn hashes are used in the deployment,
    // which is more realistic for larger deployments.

    it.only('entire config is an exact match', async () => {
      // TODO: rm
      await deploy(
        userConfig,
        provider,
        liveDeployerPK,
        'hardhat',
        defaultCre,
        FailureAction.THROW
      )

      expect(true).equals(false)

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedConfig(
          userConfig,
          provider,
          defaultCre,
          plugins.makeGetConfigArtifacts(hre),
          ownerAddress,
          FailureAction.THROW
        )

      const { bundles } = await getProjectBundleInfo(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const validation = await validate(
        provider,
        parsedConfig,
        bundles.actionBundle,
        configArtifacts,
        configCache
      )

      // TODO
      const { chainId } = await provider.getNetwork()
      const postDeploy =
        parsedConfig.postDeploy[Number(chainId) as SupportedChainId]

      // Narrows the TypeScript type.
      if (!postDeploy) {
        throw new Error(`TODO: should never happen`)
      }

      const expectedNumActions =
        Object.keys(parsedConfig.contracts).length + postDeploy.length
      expect(validation.actionValidation.length).equals(expectedNumActions)

      let currentActionIndex = 0
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const constructorArgs =
          contractConfig.constructorArgs[Number(chainId) as SupportedChainId] ??
          {}
        const expectedSignature: SphinxFunctionSignature = {
          referenceNameOrAddress: referenceName,
          functionName: 'constructor',
          variables: constructorArgs,
        }

        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          expectedSignature
        )
        expect(actionValidation.address).equals(contractConfig.address)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      for (const postDeployAction of postDeploy) {
        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          postDeployAction.readableSignature
        )
        expect(actionValidation.address).equals(postDeployAction.to)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      expect(validation.transactionValidation).equals(
        TransactionValidation.CORRECT
      )
    })

    it('all contracts are a similar match', async () => {
      const userConfigSimilarMatch = structuredClone(userConfig)
      Object.values(userConfigSimilarMatch.contracts).forEach(
        (contractConfig) => {
          contractConfig.contract = 'MyBigContractCopy'
        }
      )

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedConfig(
          userConfigSimilarMatch,
          provider,
          defaultCre,
          plugins.makeGetConfigArtifacts(hre),
          ownerAddress,
          FailureAction.THROW
        )

      const { bundles } = await getProjectBundleInfo(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const validation = await validate(
        provider,
        parsedConfig,
        bundles.actionBundle,
        configArtifacts,
        configCache
      )

      // TODO(test): what happens if we remove a post-deployment action from the correct config?
      // note that we probably can't rely on the deployment state b/c there may be multiple
      // deployment IDs for this config. this applies to the TODO below too.

      // TODO(test): what happens if we ADD a post-deployment action from the correct config?

      // TODO(docs): we don't use the deployment ID because it's possible that a single config was
      // deployed over multiple deployment IDs. also, we don't use it because the goal of this
      // function is to guarantee that the exact transactions were deployed correctly without making
      // any assumptions about our system operating correctly.

      // TODO
      const { chainId } = await provider.getNetwork()
      const postDeploy =
        parsedConfig.postDeploy[Number(chainId) as SupportedChainId]

      // Narrows the TypeScript type.
      if (!postDeploy) {
        throw new Error(`TODO: should never happen`)
      }

      const expectedNumActions =
        Object.keys(parsedConfig.contracts).length + postDeploy.length
      expect(validation.actionValidation.length).equals(expectedNumActions)

      let currentActionIndex = 0
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const constructorArgs =
          contractConfig.constructorArgs[Number(chainId) as SupportedChainId] ??
          {}
        const expectedSignature: SphinxFunctionSignature = {
          referenceNameOrAddress: referenceName,
          functionName: 'constructor',
          variables: constructorArgs,
        }

        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.SIMILAR_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          expectedSignature
        )
        expect(actionValidation.address).equals(contractConfig.address)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      for (const postDeployAction of postDeploy) {
        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          postDeployAction.readableSignature
        )
        expect(actionValidation.address).equals(postDeployAction.to)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      expect(validation.transactionValidation).equals(
        TransactionValidation.CORRECT
      )
    })

    it('entire config has not been executed yet', async () => {
      const newUserConfig = structuredClone(userConfig)
      const Copy_MyContractA = new Contract('{{ Copy_MyContractA }}')
      const Copy_MyContractB = new Contract('{{ Copy_MyContractB }}')
      for (const [referenceName, contractConfig] of Object.entries(
        newUserConfig.contracts
      )) {
        delete newUserConfig.contracts[referenceName]
        newUserConfig.contracts[`Copy_${referenceName}`] = contractConfig
      }
      newUserConfig.postDeploy = [
        Copy_MyContractA.incrementNumber(1),
        Copy_MyContractA.incrementNumber(2),
        Copy_MyContractB.incrementNumber(3),
        Copy_MyContractB.incrementNumber(4),
      ]

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedConfig(
          newUserConfig,
          provider,
          defaultCre,
          plugins.makeGetConfigArtifacts(hre),
          ownerAddress,
          FailureAction.THROW
        )

      const { bundles } = await getProjectBundleInfo(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const validation = await validate(
        provider,
        parsedConfig,
        bundles.actionBundle,
        configArtifacts,
        configCache
      )

      // TODO
      const { chainId } = await provider.getNetwork()
      const postDeploy =
        parsedConfig.postDeploy[Number(chainId) as SupportedChainId]

      // Narrows the TypeScript type.
      if (!postDeploy) {
        throw new Error(`TODO: should never happen`)
      }

      const expectedNumActions =
        Object.keys(parsedConfig.contracts).length + postDeploy.length
      expect(validation.actionValidation.length).equals(expectedNumActions)

      let currentActionIndex = 0
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const constructorArgs =
          contractConfig.constructorArgs[Number(chainId) as SupportedChainId] ??
          {}
        const expectedSignature: SphinxFunctionSignature = {
          referenceNameOrAddress: referenceName,
          functionName: 'constructor',
          variables: constructorArgs,
        }

        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.NOT_EXECUTED_YET
        )
        expect(actionValidation.functionSignature).deep.equals(
          expectedSignature
        )

        currentActionIndex += 1
      }

      for (const postDeployAction of postDeploy) {
        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.NOT_EXECUTED_YET
        )
        expect(actionValidation.functionSignature).deep.equals(
          postDeployAction.readableSignature
        )

        currentActionIndex += 1
      }

      expect(validation.transactionValidation).equals(
        TransactionValidation.INVALID_ACTIONS
      )
    })

    it('contracts are not a match and post-deployment actions are not executed yet', async () => {
      const newUserConfig = structuredClone(userConfig)
      Object.values(newUserConfig.contracts).forEach((contractConfig) => {
        contractConfig.contract = 'MyBigContractChild'
      })
      newUserConfig.postDeploy = [
        MyContractA.incrementNumber(5),
        MyContractA.incrementNumber(6),
        MyContractB.incrementNumber(7),
        MyContractB.incrementNumber(8),
      ]

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedConfig(
          newUserConfig,
          provider,
          defaultCre,
          plugins.makeGetConfigArtifacts(hre),
          ownerAddress,
          FailureAction.THROW
        )

      const { bundles } = await getProjectBundleInfo(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const validation = await validate(
        provider,
        parsedConfig,
        bundles.actionBundle,
        configArtifacts,
        configCache
      )

      // TODO
      const { chainId } = await provider.getNetwork()
      const postDeploy =
        parsedConfig.postDeploy[Number(chainId) as SupportedChainId]

      // Narrows the TypeScript type.
      if (!postDeploy) {
        throw new Error(`TODO: should never happen`)
      }

      const expectedNumActions =
        Object.keys(parsedConfig.contracts).length + postDeploy.length
      expect(validation.actionValidation.length).equals(expectedNumActions)

      let currentActionIndex = 0
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const constructorArgs =
          contractConfig.constructorArgs[Number(chainId) as SupportedChainId] ??
          {}
        const expectedSignature: SphinxFunctionSignature = {
          referenceNameOrAddress: referenceName,
          functionName: 'constructor',
          variables: constructorArgs,
        }

        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.NO_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          expectedSignature
        )
        expect(actionValidation.address).equals(contractConfig.address)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      for (const postDeployAction of postDeploy) {
        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.NOT_EXECUTED_YET
        )
        expect(actionValidation.functionSignature).deep.equals(
          postDeployAction.readableSignature
        )

        currentActionIndex += 1
      }

      expect(validation.transactionValidation).equals(
        TransactionValidation.INVALID_ACTIONS
      )
    })

    it('post-deployment actions were executed in an incorrect order', async () => {
      const newUserConfig = structuredClone(userConfig)
      newUserConfig.postDeploy = [
        // The order of the actions is incorrect.
        MyContractA.incrementNumber(2),
        MyContractA.incrementNumber(1),
        MyContractB.incrementNumber(4),
        MyContractB.incrementNumber(3),
      ]

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedConfig(
          newUserConfig,
          provider,
          defaultCre,
          plugins.makeGetConfigArtifacts(hre),
          ownerAddress,
          FailureAction.THROW
        )

      const { bundles } = await getProjectBundleInfo(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const validation = await validate(
        provider,
        parsedConfig,
        bundles.actionBundle,
        configArtifacts,
        configCache
      )

      // TODO
      const { chainId } = await provider.getNetwork()
      const postDeploy =
        parsedConfig.postDeploy[Number(chainId) as SupportedChainId]

      // Narrows the TypeScript type.
      if (!postDeploy) {
        throw new Error(`TODO: should never happen`)
      }

      const expectedNumActions =
        Object.keys(parsedConfig.contracts).length + postDeploy.length
      expect(validation.actionValidation.length).equals(expectedNumActions)

      let currentActionIndex = 0
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const constructorArgs =
          contractConfig.constructorArgs[Number(chainId) as SupportedChainId] ??
          {}
        const expectedSignature: SphinxFunctionSignature = {
          referenceNameOrAddress: referenceName,
          functionName: 'constructor',
          variables: constructorArgs,
        }

        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          expectedSignature
        )
        expect(actionValidation.address).equals(contractConfig.address)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      for (const postDeployAction of postDeploy) {
        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          postDeployAction.readableSignature
        )
        expect(actionValidation.address).equals(postDeployAction.to)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      expect(validation.transactionValidation).equals(
        TransactionValidation.INCORRECT_ORDER
      )
    })

    it('incorrect number of transactions sent from the SphinxManager', async () => {
      const newUserConfig = structuredClone(userConfig)
      // We remove the third action.
      newUserConfig.postDeploy = [
        MyContractA.incrementNumber(1),
        MyContractA.incrementNumber(2),
        MyContractB.incrementNumber(4),
      ]

      const { parsedConfig, configCache, configArtifacts } =
        await getParsedConfig(
          newUserConfig,
          provider,
          defaultCre,
          plugins.makeGetConfigArtifacts(hre),
          ownerAddress,
          FailureAction.THROW
        )

      const { bundles } = await getProjectBundleInfo(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const validation = await validate(
        provider,
        parsedConfig,
        bundles.actionBundle,
        configArtifacts,
        configCache
      )

      // TODO
      const { chainId } = await provider.getNetwork()
      const postDeploy =
        parsedConfig.postDeploy[Number(chainId) as SupportedChainId]

      // Narrows the TypeScript type.
      if (!postDeploy) {
        throw new Error(`TODO: should never happen`)
      }

      const expectedNumActions =
        Object.keys(parsedConfig.contracts).length + postDeploy.length
      expect(validation.actionValidation.length).equals(expectedNumActions)

      let currentActionIndex = 0
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const constructorArgs =
          contractConfig.constructorArgs[Number(chainId) as SupportedChainId] ??
          {}
        const expectedSignature: SphinxFunctionSignature = {
          referenceNameOrAddress: referenceName,
          functionName: 'constructor',
          variables: constructorArgs,
        }

        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          expectedSignature
        )
        expect(actionValidation.address).equals(contractConfig.address)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      for (const postDeployAction of postDeploy) {
        const actionValidation = validation.actionValidation[currentActionIndex]
        // Narrows the TypeScript type.
        if (!isExecutedActionValidationOutput(actionValidation)) {
          throw new Error(`TODO: should never happen`)
        }
        expect(actionValidation.match).equals(
          ActionValidationResultType.EXACT_MATCH
        )
        expect(actionValidation.functionSignature).deep.equals(
          postDeployAction.readableSignature
        )
        expect(actionValidation.address).equals(postDeployAction.to)
        expect(ethers.isHexString(actionValidation.transactionHash, 32)).equals(
          true
        )

        currentActionIndex += 1
      }

      expect(validation.transactionValidation).equals(
        TransactionValidation.INCORRECT_TRANSACTION_COUNT
      )
    })
  })

  // config types:
  // - multiple contracts, multiple post-deployment actions
  // - multiple contracts, no post-deployment actions
  // - no contracts, multiple post-deployment actions
  // - one contract, one post-deployment action

  // - TODO: you should have a duplicate call action (e.g. increment(5) x 2) in a config.
  // - TODO: you should have a contract with constructor args in one of your configs (for contract similar match).

  // scenarios:
  // - entire config is an exact match
  // - all contracts are a similar match (only attempt if there's at least one contract in the config)
  // - entire config hasn't been executed yet
  // - contracts are not a match and post-deployment actions are not executed yet
  // - post-deployment actions were executed in an incorrect order (only attempt if post-deployment actions exist in config)
  // - extra transaction was executed from the sphinx manager
  // - multiple deployment ids
})

// TODO: add test for `isExecutedActionValidationOutput`, e.g.:
// expect(isExecutedActionValidationOutput(actionValidation)).equals(true)
