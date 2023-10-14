import { expect } from 'chai'
import { ethers } from 'ethers'

import { ParsedConfig } from '../src/config/types'
import { SphinxActionType } from '../src/actions/types'
import { getPreview } from '../src/preview'
import { ParsedVariable } from '../dist'

const firstContractConstructorArgs: ParsedVariable = {
  myVar: 'myVal',
  myOtherVar: 'myOtherVal',
}
const secondContractConstructorArgs: ParsedVariable = {
  myVar2: 'myVal2',
  myOtherVar2: 'myOtherVal2',
}

const coder = ethers.AbiCoder.defaultAbiCoder()

const abiEncodedConstructorArgs = coder.encode(
  ['string', 'string'],
  Object.values(firstContractConstructorArgs)
)

const originalParsedConfig: ParsedConfig = {
  chainId: '10',
  isLiveNetwork: true,
  actionInputs: [
    {
      actionType: SphinxActionType.DEPLOY_CONTRACT.toString(),
      decodedAction: {
        referenceName: 'MyFirstReferenceName',
        functionName: 'constructor',
        variables: firstContractConstructorArgs,
      },
      skip: false,
      // These fields are unused:
      fullyQualifiedName: 'contracts/MyFile.sol:MyContract',
      initCode: '',
      constructorArgs: abiEncodedConstructorArgs,
      userSalt: ethers.ZeroHash,
      referenceName: 'MyFirstReferenceName',
      create3Address: ethers.ZeroAddress,
    },
    {
      actionType: SphinxActionType.CALL.toString(),
      decodedAction: {
        referenceName: 'MyFirstReferenceName',
        functionName: 'myFunction',
        variables: {
          myFunctionVar: 'myFunctionValue',
        },
      },
      skip: false,
      // These fields are unused:
      fullyQualifiedName: 'contracts/MyFile.sol:MyContract',
      to: ethers.ZeroAddress,
      selector: '',
      functionParams: '',
      nonce: '0',
      referenceName: 'MyFirstReferenceName',
    },
    {
      actionType: SphinxActionType.DEPLOY_CONTRACT.toString(),
      decodedAction: {
        referenceName: 'MySecondReferenceName',
        functionName: 'constructor',
        variables: secondContractConstructorArgs,
      },
      skip: false,
      // These fields are unused:
      fullyQualifiedName: 'contracts/MyOtherFile.sol:MyOtherContract',
      initCode: '',
      constructorArgs: abiEncodedConstructorArgs,
      userSalt: ethers.ZeroHash,
      referenceName: 'MySecondReferenceName',
      create3Address: ethers.ZeroAddress,
    },
  ],
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
      const preview = getPreview([originalParsedConfig])

      expect(preview.length).to.equal(1)
      const { networkTags, executing, skipping } = preview[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(4)
      const [sphinxManager, constructorOne, functionCall, constructorTwo] =
        executing
      expect(sphinxManager).to.deep.equal({
        referenceName: 'SphinxManager',
        functionName: 'constructor',
        variables: {},
      })
      expect(constructorOne).to.deep.equal({
        referenceName: 'MyFirstReferenceName',
        functionName: 'constructor',
        variables: firstContractConstructorArgs,
      })
      expect(functionCall).to.deep.equal({
        referenceName: 'MyFirstReferenceName',
        functionName: 'myFunction',
        variables: {
          myFunctionVar: 'myFunctionValue',
        },
      })
      expect(constructorTwo).to.deep.equal({
        referenceName: 'MySecondReferenceName',
        functionName: 'constructor',
        variables: secondContractConstructorArgs,
      })
      expect(skipping.length).to.equal(0)
    })
  })

  it('returns preview for single network that is executing everything, except SphinxManager', () => {
    const parsedConfig = structuredClone(originalParsedConfig)
    parsedConfig.initialState.isManagerDeployed = true
    const preview = getPreview([parsedConfig])

    expect(preview.length).to.equal(1)
    const { networkTags, executing, skipping } = preview[0]
    expect(networkTags).to.deep.equal(['optimism'])
    expect(executing.length).to.equal(3)
    const [constructorOne, functionCall, constructorTwo] = executing
    expect(constructorOne).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: firstContractConstructorArgs,
    })
    expect(functionCall).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionValue',
      },
    })
    expect(constructorTwo).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: secondContractConstructorArgs,
    })
    expect(skipping.length).to.equal(0)
  })

  it('returns preview for single network that is skipping everything', () => {
    const parsedConfig = structuredClone(originalParsedConfig)
    parsedConfig.initialState.isManagerDeployed = true
    parsedConfig.actionInputs = parsedConfig.actionInputs.map((action) => ({
      ...action,
      skip: true,
    }))

    const preview = getPreview([parsedConfig])

    expect(preview.length).to.equal(1)
    const { networkTags, executing, skipping } = preview[0]
    expect(networkTags).to.deep.equal(['optimism'])
    expect(executing.length).to.equal(0)
    expect(skipping.length).to.equal(3)
    const [constructorOne, functionCall, constructorTwo] = skipping
    expect(constructorOne).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: firstContractConstructorArgs,
    })
    expect(functionCall).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionValue',
      },
    })
    expect(constructorTwo).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: secondContractConstructorArgs,
    })
  })

  // If a function call or constructor has at least one unnamed argument, then the arguments will be
  // displayed as an array of values instead of an object.
  it('returns preview for unnamed constructor and function calls', () => {
    const parsedConfig = structuredClone(originalParsedConfig)
    parsedConfig.actionInputs = parsedConfig.actionInputs.map((action) => ({
      ...action,
      decodedAction: {
        ...action.decodedAction,
        variables: Object.values(action.decodedAction.variables),
      },
    }))

    const preview = getPreview([parsedConfig])

    expect(preview.length).to.equal(1)
    const { networkTags, executing, skipping } = preview[0]
    expect(networkTags).to.deep.equal(['optimism'])
    expect(executing.length).to.equal(4)
    expect(skipping.length).to.equal(0)
    const [, constructorOne, functionCall, constructorTwo] = executing
    expect(constructorOne).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: Object.values(firstContractConstructorArgs),
    })
    expect(functionCall).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: ['myFunctionValue'],
    })
    expect(constructorTwo).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: Object.values(secondContractConstructorArgs),
    })
  })

  it('returns merged preview for networks that are the same', () => {
    const parsedConfigArbitrum = structuredClone(originalParsedConfig)
    const parsedConfigPolygon = structuredClone(originalParsedConfig)
    parsedConfigArbitrum.chainId = '42161'
    parsedConfigPolygon.chainId = '137'

    const preview = getPreview([
      originalParsedConfig,
      parsedConfigArbitrum,
      parsedConfigPolygon,
    ])

    expect(preview.length).to.equal(1)
    const { networkTags, executing, skipping } = preview[0]
    expect(networkTags).to.deep.equal(['optimism', 'arbitrum', 'polygon'])
    expect(executing.length).to.equal(4)
    const [sphinxManager, constructorOne, functionCall, constructorTwo] =
      executing
    expect(sphinxManager).to.deep.equal({
      referenceName: 'SphinxManager',
      functionName: 'constructor',
      variables: {},
    })
    expect(constructorOne).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: firstContractConstructorArgs,
    })
    expect(functionCall).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionValue',
      },
    })
    expect(constructorTwo).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: secondContractConstructorArgs,
    })
    expect(skipping.length).to.equal(0)
  })

  it('returns preview for networks that are different', () => {
    const parsedConfigArbitrum = structuredClone(originalParsedConfig)
    const parsedConfigPolygon = structuredClone(originalParsedConfig)
    parsedConfigArbitrum.chainId = '42161'
    parsedConfigPolygon.chainId = '137'

    // Skip the SphinxManager and the first contract deployment on Polygon
    parsedConfigPolygon.actionInputs[0].skip = true
    parsedConfigPolygon.initialState.isManagerDeployed = true

    // Use different constructor arguments for the first contract on Arbitrum
    const constructorArgsArbitrum = {
      myVar: 'myArbitrumVal',
      myOtherVar: 'myOtherArbitrumVal',
    }
    parsedConfigArbitrum.actionInputs[0].decodedAction.variables =
      constructorArgsArbitrum

    const preview = getPreview([
      originalParsedConfig,
      parsedConfigPolygon,
      parsedConfigArbitrum,
    ])

    expect(preview.length).to.equal(3)
    const [
      {
        networkTags: networkTagsOptimism,
        executing: executingOptimism,
        skipping: skippingOptimism,
      },
      {
        networkTags: networkTagsPolygon,
        executing: executingPolygon,
        skipping: skippingPolygon,
      },
      {
        networkTags: networkTagsArbitrum,
        executing: executingArbitrum,
        skipping: skippingArbitrum,
      },
    ] = preview

    expect(networkTagsOptimism).to.deep.equal(['optimism'])
    expect(executingOptimism.length).to.equal(4)
    const [
      sphinxManagerOptimism,
      constructorOneOptimism,
      functionCallOptimism,
      constructorTwoOptimism,
    ] = executingOptimism
    expect(sphinxManagerOptimism).to.deep.equal({
      referenceName: 'SphinxManager',
      functionName: 'constructor',
      variables: {},
    })
    expect(constructorOneOptimism).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: firstContractConstructorArgs,
    })
    expect(functionCallOptimism).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionValue',
      },
    })
    expect(constructorTwoOptimism).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: secondContractConstructorArgs,
    })
    expect(skippingOptimism.length).to.equal(0)

    expect(networkTagsPolygon).to.deep.equal(['polygon'])
    expect(executingPolygon.length).to.equal(2)
    const [functionCallPolygon, constructorTwo] = executingPolygon
    expect(constructorTwo).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: secondContractConstructorArgs,
    })
    expect(functionCallPolygon).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionValue',
      },
    })
    expect(skippingPolygon.length).to.equal(1)
    const [constructorPolygon] = skippingPolygon
    expect(constructorPolygon).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: firstContractConstructorArgs,
    })

    expect(networkTagsArbitrum).to.deep.equal(['arbitrum'])
    expect(executingArbitrum.length).to.equal(4)
    const [
      sphinxManagerArbitrum,
      constructorOneArbitrum,
      functionCallArbitrum,
      constructorTwoArbitrum,
    ] = executingArbitrum
    expect(sphinxManagerArbitrum).to.deep.equal({
      referenceName: 'SphinxManager',
      functionName: 'constructor',
      variables: {},
    })
    expect(constructorOneArbitrum).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'constructor',
      variables: constructorArgsArbitrum,
    })
    expect(functionCallArbitrum).to.deep.equal({
      referenceName: 'MyFirstReferenceName',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionValue',
      },
    })
    expect(constructorTwoArbitrum).to.deep.equal({
      referenceName: 'MySecondReferenceName',
      functionName: 'constructor',
      variables: secondContractConstructorArgs,
    })
    expect(skippingArbitrum.length).to.equal(0)
  })
})
