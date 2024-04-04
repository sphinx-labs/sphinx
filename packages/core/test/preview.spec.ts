import { expect } from 'chai'
import { ethers, parseUnits } from 'ethers'
import { CREATE3_PROXY_INITCODE, Operation } from '@sphinx-labs/contracts'

import {
  Create2ActionInput,
  CreateActionInput,
  NetworkConfig,
} from '../src/config/types'
import { getPreview } from '../src/preview'
import { ActionInputType, FunctionCallActionInput } from '../dist'
import { ExecutionMode } from '../src/constants'

const safeAddress = '0x' + 'ff'.repeat(20)
const dummyMerkleRoot = '0x' + 'fe'.repeat(32)

const expectedGnosisSafe = {
  address: safeAddress,
  referenceName: 'GnosisSafe',
  functionName: 'deploy',
  variables: {},
  value: '0',
}
const expectedSphinxModule = {
  address: '0x' + 'ee'.repeat(20),
  referenceName: 'SphinxModule',
  functionName: 'deploy',
  variables: {},
  value: '0',
}
const expectedFundingRequest = {
  type: 'FundingSafe',
  value: parseUnits('0.1', 'ether').toString(),
}

const safeBalanceCheck: FunctionCallActionInput = {
  actionType: ActionInputType.CALL,
  decodedAction: {
    referenceName: safeAddress,
    functionName: 'call',
    variables: ['0x'],
    address: '',
    value: parseUnits('0.1', 'ether').toString(),
  },
  index: '1',
  operation: Operation.Call,
  txData: '0x',
  to: safeAddress,
  requireSuccess: true,
  value: parseUnits('0.1', 'ether').toString(),
  contracts: [],
  // These fields are unused:
  gas: '0',
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
    value: '0',
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
const expectedCreate: CreateActionInput = {
  actionType: ActionInputType.CREATE,
  decodedAction: {
    referenceName: 'MyFirstContract',
    functionName: 'constructor',
    variables: {
      myVar: 'myVal',
      myOtherVar: 'myOtherVal',
    },
    address: '0x' + 'aa'.repeat(20),
    value: parseUnits('0.1', 'ether').toString(),
  },
  // These fields are unused:
  contractAddress: '',
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
    value: parseUnits('0.1', 'ether').toString(),
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
    value: '0',
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
const originalNetworkConfig: NetworkConfig = {
  chainId: '10',
  executionMode: ExecutionMode.Platform,
  actionInputs: [
    safeBalanceCheck,
    expectedCreate2,
    expectedFunctionCallOne,
    expectedCall,
    expectedCreate,
  ],
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
  safeAddress,
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
  safeFundingRequest: {
    startingBalance: '0',
    fundsRequested: parseUnits('0.1', 'ether').toString(),
  },
}

describe('Preview', () => {
  const expectedUnlabeledAddresses = new Set([
    unlabeledAddressOne,
    unlabeledAddressTwo,
  ])

  describe('getPreview', () => {
    it('returns preview for single network that is executing everything, including Gnosis Safe and Sphinx Module', () => {
      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [originalNetworkConfig],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(7)
      const [
        gnosisSafe,
        sphinxModule,
        fundingRequest,
        create2,
        functionCall,
        call,
      ] = executing
      expect(gnosisSafe).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(fundingRequest).to.deep.equal(expectedFundingRequest)
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    it('returns preview for single network that is executing everything, except sending funds to the Gnosis Safe', () => {
      const networkConfig = structuredClone(originalNetworkConfig)
      networkConfig.safeFundingRequest!.fundsRequested = '0'
      networkConfig.actionInputs.shift()
      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [networkConfig],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(6)
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
      const networkConfig = structuredClone(originalNetworkConfig)
      networkConfig.initialState.isSafeDeployed = true
      networkConfig.initialState.isModuleDeployed = true

      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [networkConfig],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(5)
      const [fundingRequest, create2, functionCall, call] = executing
      expect(fundingRequest).to.deep.equal(expectedFundingRequest)
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    // If a function call or constructor has at least one unnamed argument, then the arguments will be
    // displayed as an array of values instead of an object.
    it('returns preview for unnamed constructor and function calls', () => {
      const networkConfig = structuredClone(originalNetworkConfig)
      networkConfig.actionInputs = networkConfig.actionInputs.map((action) => {
        return {
          ...action,
          decodedAction: {
            ...action.decodedAction,
            variables: Object.values(action.decodedAction.variables!),
          },
        }
      })

      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [networkConfig],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(7)
      const [
        gnosisSafe,
        sphinxModule,
        fundingRequest,
        create2,
        functionCall,
        call,
      ] = executing
      expect(gnosisSafe).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(fundingRequest).to.deep.equal(expectedFundingRequest)
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
      const networkConfigArbitrum = structuredClone(originalNetworkConfig)
      const networkConfigPolygon = structuredClone(originalNetworkConfig)
      networkConfigArbitrum.chainId = '42161'
      networkConfigPolygon.chainId = '137'

      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [originalNetworkConfig, networkConfigArbitrum, networkConfigPolygon],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

      expect(networks.length).to.equal(1)
      const [{ networkTags, executing }] = networks

      expect(networkTags).to.deep.equal(['optimism', 'arbitrum', 'polygon'])
      expect(executing.length).to.equal(7)
      const [
        gnosisSafeOptimism,
        sphinxModuleOptimism,
        fundingRequestOptimism,
        create2Optimism,
        functionCallOptimism,
        callOptimism,
      ] = executing
      expect(gnosisSafeOptimism).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModuleOptimism).to.deep.equal(expectedSphinxModule)
      expect(fundingRequestOptimism).to.deep.equal(expectedFundingRequest)
      expect(create2Optimism).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallOptimism).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callOptimism).to.deep.equal(expectedCall.decodedAction)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })

    it('returns preview for networks that are different', () => {
      const networkConfigArbitrum = structuredClone(originalNetworkConfig)
      const networkConfigPolygon = structuredClone(originalNetworkConfig)
      networkConfigArbitrum.chainId = '42161'
      networkConfigPolygon.chainId = '137'

      // Skip the Gnosis Safe on Polygon
      networkConfigPolygon.initialState.isSafeDeployed = true

      // Use different variables for the first action on Arbitrum (other than the Safe balance check)
      const variablesArbitrum = {
        myVar: 'myArbitrumVal',
        myOtherVar: 'myOtherArbitrumVal',
      }
      const firstAction = networkConfigArbitrum.actionInputs[1]
      firstAction.decodedAction.variables = variablesArbitrum

      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [originalNetworkConfig, networkConfigArbitrum, networkConfigPolygon],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

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
      expect(executingOptimism.length).to.equal(7)
      const [
        gnosisSafeOptimism,
        sphinxModuleOptimism,
        fundingRequestOptimism,
        create2Optimism,
        functionCallOptimism,
        callOptimism,
      ] = executingOptimism
      expect(gnosisSafeOptimism).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModuleOptimism).to.deep.equal(expectedSphinxModule)
      expect(fundingRequestOptimism).to.deep.equal(expectedFundingRequest)
      expect(create2Optimism).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallOptimism).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callOptimism).to.deep.equal(expectedCall.decodedAction)
      expect(skippingOptimism.length).to.equal(0)

      expect(networkTagsPolygon).to.deep.equal(['polygon'])
      expect(executingPolygon.length).to.equal(6)
      const [
        sphinxModule,
        fundingRequest,
        create2Polygon,
        functionCallPolygon,
        callPolygon,
      ] = executingPolygon
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(fundingRequest).to.deep.equal(expectedFundingRequest)
      expect(create2Polygon).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCallPolygon).to.deep.equal(
        expectedFunctionCallOne.decodedAction
      )
      expect(callPolygon).to.deep.equal(expectedCall.decodedAction)
      expect(skippingPolygon.length).to.equal(0)

      expect(networkTagsArbitrum).to.deep.equal(['arbitrum'])
      expect(executingArbitrum.length).to.equal(7)
      const [
        gnosisSafeArbitrum,
        sphinxModuleArbitrum,
        fundingRequestArbitrum,
        create2Arbitrum,
        functionCallArbitrum,
        callArbitrum,
      ] = executingArbitrum
      expect(gnosisSafeArbitrum).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModuleArbitrum).to.deep.equal(expectedSphinxModule)
      expect(fundingRequestArbitrum).to.deep.equal(expectedFundingRequest)
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
      const networkConfigWithSystemNotDeployed = structuredClone(
        originalNetworkConfig
      )
      networkConfigWithSystemNotDeployed.isSystemDeployed = false

      const { networks, unlabeledAddresses, merkleRoot } = getPreview(
        [networkConfigWithSystemNotDeployed],
        dummyMerkleRoot
      )
      expect(merkleRoot).equals(dummyMerkleRoot)

      expect(networks.length).to.equal(1)
      const { networkTags, executing, skipping } = networks[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(8)
      const [
        systemContracts,
        gnosisSafe,
        sphinxModule,
        fundingRequest,
        create2,
        functionCall,
        call,
      ] = executing
      expect(systemContracts).to.deep.equal({
        type: 'SystemDeployment',
      })
      expect(gnosisSafe).to.deep.equal(expectedGnosisSafe)
      expect(sphinxModule).to.deep.equal(expectedSphinxModule)
      expect(fundingRequest).to.deep.equal(expectedFundingRequest)
      expect(create2).to.deep.equal(expectedCreate2.decodedAction)
      expect(functionCall).to.deep.equal(expectedFunctionCallOne.decodedAction)
      expect(call).to.deep.equal(expectedCall.decodedAction)
      expect(skipping.length).to.equal(0)
      expect(unlabeledAddresses).to.deep.equal(expectedUnlabeledAddresses)
    })
  })
})
