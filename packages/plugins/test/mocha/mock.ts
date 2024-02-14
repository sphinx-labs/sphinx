import { readFileSync, readdirSync } from 'fs'

import {
  ActionInputType,
  BuildInfo,
  ConfigArtifacts,
  ExecutionMode,
  GetConfigArtifacts,
  ParsedConfig,
  isLiveNetwork,
} from '@sphinx-labs/core'
import sinon from 'sinon'
import { Operation } from '@sphinx-labs/contracts'

import { propose } from '../../src/cli/propose'
import { deploy } from '../../src/cli/deploy'
import { makeSphinxContext } from '../../src/cli/context'
import { readContractArtifact } from '../../dist'

let buildInfos: BuildInfo[]

/**
 * Make a mocked `SphinxContext` object. Use this function if it's safe to assume that all of
 * `SphinxContext` member functions are mocked. In integration tests, use the
 * `makeMockSphinxContextForIntegrationTests` function instead.
 */
export const makeMockSphinxContext = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      _initCodeWithArgsArray: Array<string>
    ) => {
      const configArtifacts: ConfigArtifacts = {}
      const files = readdirSync(`./out/artifacts/build-info/`)
      if (!buildInfos) {
        buildInfos = await Promise.all(
          files.map((file) =>
            JSON.parse(
              readFileSync(`./out/artifacts/build-info/${file}`, 'utf8')
            )
          )
        )
      }

      for (const name of mockedFullyQualifiedNames) {
        const [file, contract] = name.split(':')

        const buildInfo = buildInfos.find(
          (info) =>
            info.output.contracts[file] && info.output.contracts[file][contract]
        )

        if (!buildInfo) {
          throw new Error(
            'Could not find build info for test contract, this should never happen but is just a bug in the integration test mock'
          )
        }

        const artifact = await readContractArtifact(
          name,
          projectRoot,
          artifactFolder
        )
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
    blockNumber: '0',
    actionInputs: [
      {
        contracts: [],
        index: '0',
        actionType: ActionInputType.CALL,
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
    isSystemDeployed: true,
    unlabeledContracts: [],
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
    prompt,
    relayProposal,
    storeCanonicalConfig,
    makeGetConfigArtifacts,
  } = makeMockSphinxContext(fullyQualifiedNames)
  const context = makeSphinxContext()
  context.makeGetConfigArtifacts = makeGetConfigArtifacts
  context.prompt = prompt
  context.relayProposal = relayProposal
  context.storeCanonicalConfig = storeCanonicalConfig

  return { context, prompt }
}
