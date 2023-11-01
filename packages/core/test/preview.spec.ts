import { expect } from 'chai'
import { ethers } from 'ethers'

import { Create2ActionInput, ParsedConfig } from '../src/config/types'
import { SphinxActionType } from '../src/actions/types'
import { getPreview } from '../src/preview'
import { FunctionCallActionInput } from '../dist'

const expectedSphinxManager = {
  address: '',
  referenceName: 'SphinxManager',
  functionName: 'deploy',
  variables: [],
}
const expectedCreate2: Create2ActionInput = {
  actionType: SphinxActionType.CALL.toString(),
  decodedAction: {
    referenceName: 'MyFirstContract',
    functionName: 'constructor',
    variables: {
      myVar: 'myVal',
      myOtherVar: 'myOtherVal',
    },
    address: '0x' + 'aa'.repeat(20),
  },
  skip: false,
  // These fields are unused:
  create2Address: '',
  to: '',
  data: '',
  contractName: '',
  contracts: {},
  gas: 0n,
  additionalContracts: [],
}
const expectedFunctionCallOne: FunctionCallActionInput = {
  actionType: SphinxActionType.CALL.toString(),
  skip: false,
  decodedAction: {
    referenceName: 'MySecondContract',
    functionName: 'myFunction',
    variables: {
      myFunctionVar: 'myFunctionValue',
    },
    address: '0x' + '11'.repeat(20),
  },
  // These fields are unused:
  data: '',
  to: '',
  contracts: {},
  contractName: '',
  additionalContracts: [],
  gas: 0n,
}

const expectedCall: FunctionCallActionInput = {
  actionType: SphinxActionType.CALL.toString(),
  skip: false,
  decodedAction: {
    referenceName: '0x' + '11'.repeat(20),
    functionName: 'call',
    variables: [],
    address: '0x' + '11'.repeat(20),
  },
  // These fields are unused:
  data: '',
  to: '',
  contracts: {},
  contractName: '',
  additionalContracts: [],
  gas: 0n,
}
const originalParsedConfig: ParsedConfig = {
  chainId: '10',
  isLiveNetwork: true,
  actionInputs: [expectedCreate2, expectedFunctionCallOne, expectedCall],
  unlabeledAddresses: ['0x' + '55'.repeat(20), '0x' + '66'.repeat(20)],
  initialState: {
    isManagerDeployed: false,
    // These fields are unused:
    proposers: [],
    version: {
      major: '0',
      minor: '0',
      patch: '0',
    },
    firstProposalOccurred: false,
    isExecuting: false,
  },
  // The rest of the variables are unused:
  authAddress: ethers.ZeroAddress,
  managerAddress: ethers.ZeroAddress,
  remoteExecution: true,
  newConfig: {
    mainnets: [],
    projectName: '',
    orgId: '',
    owners: [],
    proposers: [],
    testnets: [],
    threshold: '0',
    version: {
      major: '0',
      minor: '0',
      patch: '0',
    },
  },
}

describe('Preview', () => {
  describe('getPreview', () => {
    it('returns preview for single network that is executing everything, including SphinxManager', () => {
      const { networks, unlabeledAddresses } = getPreview([
        originalParsedConfig,
      ])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(4)
      const [sphinxManager, create2, functionCall, call] = executing
      expect(sphinxManager).to.deep.equal(expectedSphinxManager)
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(
        new Set(originalParsedConfig.unlabeledAddresses)
      )
    })

    it('returns preview for single network that is executing everything, except SphinxManager', () => {
      const parsedConfig = structuredClone(originalParsedConfig)
      parsedConfig.initialState.isManagerDeployed = true

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
      expect(unlabeledAddresses).to.deep.equal(
        new Set(originalParsedConfig.unlabeledAddresses)
      )
    })

    it('returns preview for single network that is skipping everything', () => {
      const parsedConfig = structuredClone(originalParsedConfig)
      parsedConfig.initialState.isManagerDeployed = true
      parsedConfig.actionInputs = parsedConfig.actionInputs.map((action) => ({
        ...action,
        skip: true,
      }))

      const { networks, unlabeledAddresses } = getPreview([parsedConfig])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(0)
      expect(skipping.length).to.equal(3)
      const [create2, functionCall, call] = skipping
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(unlabeledAddresses).to.deep.equal(
        new Set(originalParsedConfig.unlabeledAddresses)
      )
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
            variables: Object.values(action.decodedAction.variables),
          },
        }
      })

      const { networks, unlabeledAddresses } = getPreview([parsedConfig])

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(4)
      const [sphinxManager, create2, functionCall, call] = executing
      expect(sphinxManager).to.deep.equal(expectedSphinxManager)
      expect(create2).to.deep.equal({
        ...expectedCreate2.decodedAction,
        variables: Object.values(expectedCreate2.decodedAction.variables),
      })
      expect(functionCall).to.deep.equal({
        ...expectedFunctionCallOne.decodedAction,
        variables: Object.values(
          expectedFunctionCallOne.decodedAction.variables
        ),
      })
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(
        new Set(originalParsedConfig.unlabeledAddresses)
      )
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
      expect(executing.length).to.equal(4)
      const [
        sphinxManagerOptimism,
        create2Optimism,
        functionCallOptimism,
        callOptimism,
      ] = executing
      expect(sphinxManagerOptimism).to.deep.equal(expectedSphinxManager)
      expect(create2Optimism).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallOptimism).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callOptimism).to.deep.equal(expectedCall.decodedAction)
      expect(unlabeledAddresses).to.deep.equal(
        new Set(originalParsedConfig.unlabeledAddresses)
      )
    })

    it('returns preview for networks that are different', () => {
      const parsedConfigArbitrum = structuredClone(originalParsedConfig)
      const parsedConfigPolygon = structuredClone(originalParsedConfig)
      parsedConfigArbitrum.chainId = '42161'
      parsedConfigPolygon.chainId = '137'

      // Skip the SphinxManager and the first action on Polygon
      parsedConfigPolygon.actionInputs[0].skip = true
      parsedConfigPolygon.initialState.isManagerDeployed = true

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
      expect(executingOptimism.length).to.equal(4)
      const [
        sphinxManagerOptimism,
        create2Optimism,
        functionCallOptimism,
        callOptimism,
      ] = executingOptimism
      expect(sphinxManagerOptimism).to.deep.equal(expectedSphinxManager)
      expect(create2Optimism).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallOptimism).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callOptimism).to.deep.equal(expectedCall.decodedAction)
      expect(skippingOptimism.length).to.equal(0)

      expect(networkTagsPolygon).to.deep.equal(['polygon'])
      expect(executingPolygon.length).to.equal(2)
      const [functionCallPolygon, callPolygon] = executingPolygon
      expect(functionCallPolygon).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callPolygon).to.deep.equal(expectedCall.decodedAction)
      expect(skippingPolygon.length).to.equal(1)
      const [create2Polygon] = skippingPolygon
      expect(create2Polygon).to.deep.equal(expectedCreate2.decodedAction)

      expect(networkTagsArbitrum).to.deep.equal(['arbitrum'])
      expect(executingArbitrum.length).to.equal(4)
      const [
        sphinxManagerArbitrum,
        create2Arbitrum,
        functionCallArbitrum,
        callArbitrum,
      ] = executingArbitrum
      expect(sphinxManagerArbitrum).to.deep.equal(expectedSphinxManager)
      expect(create2Arbitrum).to.deep.equal({
        ...expectedCreate2.decodedAction,
        variables: variablesArbitrum,
      })
      expect(functionCallArbitrum).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callArbitrum).to.deep.equal(expectedCall.decodedAction)
      expect(skippingArbitrum.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(
        new Set(originalParsedConfig.unlabeledAddresses)
      )
    })
  })
})
