import {
  BuildInfo,
  ConfigArtifacts,
  ExecutionMode,
  GetConfigArtifacts,
  ParsedConfig,
  isLiveNetwork,
} from '@sphinx-labs/core'
import sinon from 'sinon'
import { Operation } from '@sphinx-labs/contracts'

import { readContractArtifact } from '../../src/foundry/utils'
import { propose } from '../../src/cli/propose'
import { deploy } from '../../src/cli/deploy'
import { makeSphinxContext } from '../../src/cli/context'

/**
 * Make a mocked `SphinxContext` object. Use this function if it's safe to assume that all of
 * `SphinxContext` member functions are mocked. In integration tests, use the
 * `makeMockSphinxContextForIntegrationTests` function instead.
 */
export const makeMockSphinxContext = (
  mockedFullyQualifiedNames: Array<string>
) => {
  const sphinxContext = makeSphinxContext()

  const getNetworkGasEstimate = sinon
    .stub(sphinxContext, 'getNetworkGasEstimate')
    .returns(
      Promise.resolve({
        chainId: 0,
        estimatedGas: '0',
      })
    )
  const relayProposal = sinon
    .stub(sphinxContext, 'relayProposal')
    .returns(Promise.resolve())
  const prompt = sinon.stub().returns(Promise.resolve())
  const buildParsedConfigArray = sinon
    .stub(sphinxContext, 'buildParsedConfigArray')
    .returns(
      Promise.resolve({
        parsedConfigArray: [makeMockParsedConfig()],
        configArtifacts: {},
        isEmpty: false,
      })
    )
  const storeCanonicalConfig = sinon
    .stub(sphinxContext, 'storeCanonicalConfig')
    .returns(Promise.resolve('mock-canonical-config-id'))

  const makeGetConfigArtifacts = (
    artifactFolder: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _buildInfoFolder: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    projectRoot: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _cachePath: string
  ): GetConfigArtifacts => {
    return async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _fullyQualifiedNames: Array<string>,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _contractNames: Array<string>
    ) => {
      const configArtifacts: ConfigArtifacts = {}
      for (const name of mockedFullyQualifiedNames) {
        const artifact = await readContractArtifact(
          name,
          projectRoot,
          artifactFolder
        )
        const buildInfo: BuildInfo = {
          id: '0',
          solcVersion: '0.8.0',
          solcLongVersion: '0.8.21+commit.d9974bed',
          input: {
            language: 'Solidity',
            settings: {
              optimizer: {
                runs: undefined,
                enabled: undefined,
                details: undefined,
              },
              outputSelection: {},
            },
            sources: {},
          },
          output: {
            sources: {},
            contracts: {},
          },
        }
        configArtifacts[name] = {
          buildInfo,
          artifact,
        }
      }
      return configArtifacts
    }
  }

  return {
    isLiveNetwork,
    propose,
    deploy,
    buildParsedConfigArray,
    getNetworkGasEstimate,
    storeCanonicalConfig,
    relayProposal,
    prompt,
    makeGetConfigArtifacts,
  }
}

const makeMockParsedConfig = (): ParsedConfig => {
  return {
    safeAddress: '0x' + '11'.repeat(20),
    moduleAddress: '0x' + '22'.repeat(20),
    executorAddress: '0x' + '33'.repeat(20),
    safeInitData: '0x' + '44'.repeat(20),
    nonce: '0',
    chainId: '1',
    blockGasLimit: '0',
    actionInputs: [
      {
        contracts: [],
        index: '0',
        actionType: 'MockActionType',
        contractName: 'MockContract',
        additionalContracts: [],
        decodedAction: {
          referenceName: 'MockReference',
          functionName: 'MockFunction',
          variables: {},
          address: '0x' + '55'.repeat(20),
        },
        to: '0x' + '66'.repeat(20),
        value: '0',
        txData: '0x',
        gas: '0',
        operation: Operation.Call,
        requireSuccess: true,
      },
    ],
    newConfig: {
      projectName: 'MockProject',
      orgId: 'MockOrgId',
      owners: [],
      mainnets: [],
      testnets: [],
      threshold: '1',
      saltNonce: '0',
    },
    executionMode: ExecutionMode.LocalNetworkCLI,
    initialState: {
      isSafeDeployed: false,
      isModuleDeployed: false,
      isExecuting: false,
    },
    unlabeledAddresses: [],
    arbitraryChain: false,
    libraries: [],
    gitCommit: null,
  }
}

/**
 * Make a mock `SphinxContext` to use in integration tests. This object mocks a minimal set of
 * functionality, such as API calls and the user confirmation prompt.
 */
export const makeMockSphinxContextForIntegrationTests = (
  fullyQualifiedNames: Array<string>
) => {
  const {
    makeGetConfigArtifacts,
    prompt,
    relayProposal,
    storeCanonicalConfig,
  } = makeMockSphinxContext(fullyQualifiedNames)
  const context = makeSphinxContext()
  context.makeGetConfigArtifacts = makeGetConfigArtifacts
  context.prompt = prompt
  context.relayProposal = relayProposal
  context.storeCanonicalConfig = storeCanonicalConfig

  return { context, prompt }
}
