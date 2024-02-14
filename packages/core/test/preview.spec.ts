import { expect } from 'chai'
import { ethers } from 'ethers'
import { CREATE3_PROXY_INITCODE, Operation } from '@sphinx-labs/contracts'

import { Create2ActionInput, ParsedConfig } from '../src/config/types'
import { getPreview } from '../src/preview'
import { ActionInputType, FunctionCallActionInput } from '../dist'
import { ExecutionMode } from '../src/constants'

const expectedGnosisSafe = {
  address: '0x' + 'ff'.repeat(20),
  referenceName: 'GnosisSafe',
  functionName: 'deploy',
  variables: {},
}
const expectedSphinxModule = {
  address: '0x' + 'ee'.repeat(20),
  referenceName: 'SphinxModule',
  functionName: 'deploy',
  variables: {},
}
const expectedCreate2: Create2ActionInput = {
  actionType: ActionInputType.CREATE2,
  decodedAction: {
    referenceName: 'MyFirstContract',
    functionName: 'constructor',
    variables: {
      myVar: 'myVal',
      myOtherVar: 'myOtherVal',
    },
    address: '0x' + 'aa'.repeat(20),
  },
  // These fields are unused:
  create2Address: '',
  initCodeWithArgs: '',
  index: '0',
  value: '',
  operation: Operation.Call,
  requireSuccess: false,
  txData: '',
  to: '',
  contracts: [],
  gas: '0',
}
const expectedFunctionCallOne: FunctionCallActionInput = {
  actionType: ActionInputType.CALL,
  decodedAction: {
    referenceName: 'MySecondContract',
    functionName: 'myFunction',
    variables: {
      myFunctionVar: 'myFunctionValue',
    },
    address: '0x' + '11'.repeat(20),
  },
  // These fields are unused:
  index: '0',
  value: '',
  operation: Operation.Call,
  requireSuccess: false,
  txData: '',
  to: '',
  contracts: [],
  gas: '0',
}

const expectedCall: FunctionCallActionInput = {
  actionType: ActionInputType.CALL,
  decodedAction: {
    referenceName: '0x' + '11'.repeat(20),
    functionName: 'call',
    variables: [],
    address: '0x' + '11'.repeat(20),
  },
  // These fields are unused:
  index: '0',
  value: '',
  operation: Operation.Call,
  requireSuccess: false,
  txData: '',
  to: '',
  contracts: [],
  gas: '0',
}

const unlabeledAddressOne = '0x' + '55'.repeat(20)
const unlabeledAddressTwo = '0x' + '66'.repeat(20)
const originalParsedConfig: ParsedConfig = {
  chainId: '10',
  executionMode: ExecutionMode.Platform,
  actionInputs: [expectedCreate2, expectedFunctionCallOne, expectedCall],
  unlabeledContracts: [
    { address: unlabeledAddressOne, initCodeWithArgs: '0x123456' },
    { address: unlabeledAddressTwo, initCodeWithArgs: '0x7890' },
    // We include a `CREATE3` proxy to test that the preview doesn't include it in the
    // `unlabeledAddresses` set.
    {
      address: '0x' + '77'.repeat(20),
      initCodeWithArgs: CREATE3_PROXY_INITCODE,
    },
  ],
  safeAddress: '0x' + 'ff'.repeat(20),
  moduleAddress: '0x' + 'ee'.repeat(20),
  initialState: {
    isSafeDeployed: false,
    isModuleDeployed: false,
    // This field is unused:
    isExecuting: false,
  },
  isSystemDeployed: true,
  // The rest of the variables are unused:
  executorAddress: ethers.ZeroAddress,
  safeInitData: ethers.ZeroHash,
  nonce: '0',
  arbitraryChain: false,
  blockGasLimit: '0',
  blockNumber: '0',
  newConfig: {
    mainnets: [],
    projectName: '',
    orgId: '',
    owners: [],
    testnets: [],
    threshold: '0',
    saltNonce: '0',
  },
  libraries: [],
  gitCommit: null,
}

describe('Preview', () => {
  const expectedUnlabeledAddresses = new Set([
    unlabeledAddressOne,
    unlabeledAddressTwo,
  ])

  describe('getPreview', () => {
    it('returns preview for single network that is executing everything, including Gnosis Safe and Sphinx Module', () => {
      const { networks, unlabeledAddresses } = getPreview([
        originalParsedConfig,
      ])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(5)
      const [gnosisSafe, sphinxModule, create2, functionCall, call] = executing
      expect(gnosisSafe).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    it('returns preview for single network that is executing everything, except Gnosis Safe and Sphinx Module', () => {
      const parsedConfig = structuredClone(originalParsedConfig)
      parsedConfig.initialState.isSafeDeployed = true
      parsedConfig.initialState.isModuleDeployed = true

      const { networks, unlabeledAddresses } = getPreview([parsedConfig])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(3)
      const [create2, functionCall, call] = executing
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    // If a function call or constructor has at least one unnamed argument, then the arguments will be
    // displayed as an array of values instead of an object.
    it('returns preview for unnamed constructor and function calls', () => {
      const parsedConfig = structuredClone(originalParsedConfig)
      parsedConfig.actionInputs = parsedConfig.actionInputs.map((action) => {
        return {
          ...action,
          decodedAction: {
            ...action.decodedAction,
            variables: Object.values(action.decodedAction.variables!),
          },
        }
      })

      const { networks, unlabeledAddresses } = getPreview([parsedConfig])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(5)
      const [gnosisSafe, sphinxModule, create2, functionCall, call] = executing
      expect(gnosisSafe).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(create2).to.deep.equal({
        ...expectedCreate2.decodedAction,
        variables: Object.values(expectedCreate2.decodedAction.variables!),
      })
      expect(functionCall).to.deep.equal({
        ...expectedFunctionCallOne.decodedAction,
        variables: Object.values(
          expectedFunctionCallOne.decodedAction.variables!
        ),
      })
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    it('returns merged preview for networks that are the same', () => {
      const parsedConfigArbitrum = structuredClone(originalParsedConfig)
      const parsedConfigPolygon = structuredClone(originalParsedConfig)
      parsedConfigArbitrum.chainId = '42161'
      parsedConfigPolygon.chainId = '137'

      const { networks, unlabeledAddresses } = getPreview([
        originalParsedConfig,
        parsedConfigArbitrum,
        parsedConfigPolygon,
      ])

      expect(networks.length).to.equal(1)
      const [{ networkTags, executing }] = networks

      expect(networkTags).to.deep.equal(['optimism', 'arbitrum', 'polygon'])
      expect(executing.length).to.equal(5)
      const [
        gnosisSafeOptimism,
        sphinxModuleOptimism,
        create2Optimism,
        functionCallOptimism,
        callOptimism,
      ] = executing
      expect(gnosisSafeOptimism).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModuleOptimism).to.deep.equal(expectedSphinxModule)
      expect(create2Optimism).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallOptimism).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callOptimism).to.deep.equal(expectedCall.decodedAction)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    it('returns preview for networks that are different', () => {
      const parsedConfigArbitrum = structuredClone(originalParsedConfig)
      const parsedConfigPolygon = structuredClone(originalParsedConfig)
      parsedConfigArbitrum.chainId = '42161'
      parsedConfigPolygon.chainId = '137'

      // Skip the Gnosis Safe on Polygon
      parsedConfigPolygon.initialState.isSafeDeployed = true

      // Use different variables for the first action on Arbitrum
      const variablesArbitrum = {
        myVar: 'myArbitrumVal',
        myOtherVar: 'myOtherArbitrumVal',
      }
      const firstAction = parsedConfigArbitrum.actionInputs[0]
      firstAction.decodedAction.variables = variablesArbitrum

      const { networks, unlabeledAddresses } = getPreview([
        originalParsedConfig,
        parsedConfigArbitrum,
        parsedConfigPolygon,
      ])

      expect(networks.length).to.equal(3)
      const [
        {
          networkTags: networkTagsOptimism,
          executing: executingOptimism,
          skipping: skippingOptimism,
        },
        {
          networkTags: networkTagsArbitrum,
          executing: executingArbitrum,
          skipping: skippingArbitrum,
        },
        {
          networkTags: networkTagsPolygon,
          executing: executingPolygon,
          skipping: skippingPolygon,
        },
      ] = networks

      expect(networkTagsOptimism).to.deep.equal(['optimism'])
      expect(executingOptimism.length).to.equal(5)
      const [
        gnosisSafeOptimism,
        sphinxModuleOptimism,
        create2Optimism,
        functionCallOptimism,
        callOptimism,
      ] = executingOptimism
      expect(gnosisSafeOptimism).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModuleOptimism).to.deep.equal(expectedSphinxModule)
      expect(create2Optimism).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallOptimism).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callOptimism).to.deep.equal(expectedCall.decodedAction)
      expect(skippingOptimism.length).to.equal(0)

      expect(networkTagsPolygon).to.deep.equal(['polygon'])
      expect(executingPolygon.length).to.equal(4)
      const [sphinxModule, create2Polygon, functionCallPolygon, callPolygon] =
        executingPolygon
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(create2Polygon).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallPolygon).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callPolygon).to.deep.equal(expectedCall.decodedAction)
      expect(skippingPolygon.length).to.equal(0)

      expect(networkTagsArbitrum).to.deep.equal(['arbitrum'])
      expect(executingArbitrum.length).to.equal(5)
      const [
        gnosisSafeArbitrum,
        sphinxModuleArbitrum,
        create2Arbitrum,
        functionCallArbitrum,
        callArbitrum,
      ] = executingArbitrum
      expect(gnosisSafeArbitrum).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModuleArbitrum).to.deep.equal(expectedSphinxModule)
      expect(create2Arbitrum).to.deep.equal({
        ...expectedCreate2.decodedAction,
        variables: variablesArbitrum,
      })
      expect(functionCallArbitrum).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callArbitrum).to.deep.equal(expectedCall.decodedAction)
      expect(skippingArbitrum.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    it('returns preview when `isSystemDeployed` is `false`', () => {
      const parsedConfigWithSystemNotDeployed =
        structuredClone(originalParsedConfig)
      parsedConfigWithSystemNotDeployed.isSystemDeployed = false

      const { networks, unlabeledAddresses } = getPreview([
        parsedConfigWithSystemNotDeployed,
      ])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(6)
      const [
        systemContracts,
        gnosisSafe,
        sphinxModule,
        create2,
        functionCall,
        call,
      ] = executing
      expect(systemContracts).to.deep.equal({
        type: 'SystemDeployment',
      })
      expect(gnosisSafe).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })
  })
})
