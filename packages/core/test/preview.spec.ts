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

// TODO(docs): what's actually used in this data structure?
const originalParsedConfig: ParsedConfig = {
  actionInputs: [
    {
      actionType: SphinxActionType.DEPLOY_CONTRACT,
      fullyQualifiedName: 'contracts/MyFile.sol:MyContract',
      skip: false,
      initCode: '',
      constructorArgs: abiEncodedConstructorArgs,
      userSalt: ethers.ZeroHash,
      referenceName: 'MyFirstReferenceName',
      decodedAction: {
        referenceName: 'MyFirstReferenceName',
        functionName: 'constructor',
        variables: firstContractConstructorArgs,
      },
      create3Address: ethers.ZeroAddress,
    },
    {
      actionType: SphinxActionType.CALL,
      fullyQualifiedName: 'contracts/MyFile.sol:MyContract',
      skip: false,
      to: ethers.ZeroAddress,
      selector: '',
      functionParams: '',
      nonce: 0n,
      referenceName: 'MyFirstReferenceName',
      decodedAction: {
        referenceName: 'MyFirstReferenceName',
        functionName: 'myFunction',
        variables: {
          myFunctionVar: 'myFunctionValue',
        },
      },
    },
    {
      actionType: SphinxActionType.DEPLOY_CONTRACT,
      fullyQualifiedName: 'contracts/MyOtherFile.sol:MyOtherContract',
      skip: false,
      initCode: '',
      constructorArgs: abiEncodedConstructorArgs,
      userSalt: ethers.ZeroHash,
      referenceName: 'MySecondReferenceName',
      decodedAction: {
        referenceName: 'MySecondReferenceName',
        functionName: 'constructor',
        variables: secondContractConstructorArgs,
      },
      create3Address: ethers.ZeroAddress,
    },
  ],
  newConfig: {
    mainnets: [],
    // The following variables in `newConfig` are unused here:
    projectName: '',
    orgId: '',
    owners: [],
    proposers: [],
    testnets: [],
    threshold: 0n,
    version: {
      major: 0n,
      minor: 0n,
      patch: 0n,
    },
  },
  isLiveNetwork: true,
  initialState: {
    proposers: [],
    version: {
      major: 0n,
      minor: 0n,
      patch: 0n,
    },
    isManagerDeployed: false,
    firstProposalOccurred: false,
    isExecuting: false,
  },
  chainId: 10n,
  // The rest of the variables are unused:
  authAddress: ethers.ZeroAddress,
  managerAddress: ethers.ZeroAddress,
  remoteExecution: true,
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
    parsedConfigArbitrum.chainId = 42161n
    parsedConfigPolygon.chainId = 137n

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
    parsedConfigArbitrum.chainId = 42161n
    parsedConfigPolygon.chainId = 137n

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
