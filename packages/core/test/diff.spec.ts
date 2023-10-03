import { expect } from 'chai'
import { ethers } from 'ethers'

import {
  ConfigCache,
  NetworkType,
  ParsedConfig,
  DecodedAction,
} from '../src/config/types'
import { CallAction, SphinxActionType } from '../src/actions/types'
import { getCallHash } from '../src/utils'
import { getDiff } from '../src/diff'

const callAction: CallAction = {
  index: 1,
  to: '0x' + '22'.repeat(20),
  data: '0x12345678',
  nonce: 0,
}
const postDeployFunctionSignature: DecodedAction = {
  referenceNameOrAddress: 'MyContract',
  functionName: 'myFunction',
  variables: {
    myFunctionVar: 'myFunctionVal',
  },
}
const fullPostDeployAction = {
  to: callAction.to,
  data: callAction.data,
  nonce: callAction.nonce,
  readableSignature: postDeployFunctionSignature,
}

const coder = ethers.AbiCoder.defaultAbiCoder()
const abiEncodedConstructorArgs = coder.encode(
  ['string', 'string'],
  ['myVal', 'myOtherVal']
)
// TODO(optional): if you convert the variable array into a ParsedConfigVariable pre-diff, then
// replace this.
const decodedConstructorArgs = coder.decode(
  ['string', 'string'],
  abiEncodedConstructorArgs
)

const originalParsedConfig: ParsedConfig = {
  actionInputs: Array<ExtendedDeployContractActionInput | ExtendedFunctionCallActionInput>;
  newConfig: SphinxConfig;
  isLiveNetwork: boolean;
  initialState: InitialChainState;
  remoteExecution: boolean;

  authAddress: ethers.ZeroAddress, // unused
  managerAddress: ethers.ZeroAddress, // unused
  chainId: 10n,
  actionInputs: [{
    fullyQualifiedName: 'contracts/MyFile.sol:MyContract',
    actionType: SphinxActionType.DEPLOY_CONTRACT,
    skip: false,
    initCode: '', // unused
    constructorArgs: abiEncodedConstructorArgs,
    userSalt: ethers.ZeroHash,
    referenceName: 'MyReferenceName',
    decodedAction: {
      referenceName: 'MyReferenceName',
      functionName: 'constructor',
      variables: decodedConstructorArgs
    },
    create3Address: ethers.ZeroAddress // unused
  },
  {
    fullyQualifiedName: 'contracts/MyFile.sol:MyContract',
    actionType: SphinxActionType.CALL,
    skip: false,
    to: ethers.ZeroAddress, // unused
    selector: '', // unused
    functionParams: '', // unused
    nonce: 0n,
    referenceName: 'MyReferenceName',
    decodedAction: {
      referenceName: 'MyReferenceName',
      functionName: 'myFunction',
      variables: ['myFunctionVal']
    }
  }
  ]

  projectName: 'Diff Test',
  manager: ethers.ZeroAddress,
  contracts: {
    MyContract: {
      constructorArgs: {
        10: constructorArgs,
      },
      contract: 'MyContract',
      kind: 'immutable',
      address: ethers.ZeroAddress,
      isUserDefinedAddress: false,
      variables: {},
      unsafeAllow: {},
      salt: ethers.ZeroHash,
    },
    MyContract2: {
      constructorArgs: {
        10: constructorArgs,
      },
      contract: 'MyContract',
      kind: 'immutable',
      address: ethers.ZeroAddress,
      isUserDefinedAddress: false,
      variables: {},
      unsafeAllow: {},
      salt: ethers.ZeroHash,
    },
  },
  postDeploy: {
    10: [fullPostDeployAction],
  },
}

const callHash = getCallHash(callAction.to, callAction.data)
const originalConfigCache: ConfigCache = {
  isManagerDeployed: false,
  isExecuting: false,
  chainId: 10,
  networkName: 'optimism',
  contractConfigCache: {
    MyContract: {
      isTargetDeployed: false,
      deploymentRevert: {
        deploymentReverted: false,
      },
      importCache: {
        requiresImport: false,
      },
    },
    MyContract2: {
      isTargetDeployed: false,
      deploymentRevert: {
        deploymentReverted: false,
      },
      importCache: {
        requiresImport: false,
      },
    },
  },
  callNonces: {
    [callHash]: 0,
  },
  networkType: NetworkType.LIVE_NETWORK,
  managerVersion: {
    major: 0,
    minor: 2,
    patch: 5,
  },
  blockGasLimit: 0n,
  undeployedExternalContracts: [],
}

describe('Diff', () => {
  describe('getDiff', () => {
    it('returns diff for single network that is executing everything, including SphinxManager', () => {
      const diff = getDiff(originalParsedConfig, [originalConfigCache])

      expect(diff.length).to.equal(1)
      const { networkTags, executing, skipping } = diff[0]
      expect(networkTags).to.deep.equal(['optimism'])
      expect(executing.length).to.equal(4)
      const [
        sphinxManagerSignature,
        constructorOneSig,
        constructorTwoSig,
        postDeploySignature,
      ] = executing
      expect(sphinxManagerSignature).to.deep.equal({
        referenceNameOrAddress: 'SphinxManager',
        functionName: 'constructor',
        variables: {},
      })
      expect(constructorOneSig).to.deep.equal({
        referenceNameOrAddress: 'MyContract',
        functionName: 'constructor',
        variables: constructorArgs,
      })
      expect(constructorTwoSig).to.deep.equal({
        referenceNameOrAddress: 'MyContract2',
        functionName: 'constructor',
        variables: constructorArgs,
      })
      expect(postDeploySignature).to.deep.equal({
        referenceNameOrAddress: 'MyContract',
        functionName: 'myFunction',
        variables: {
          myFunctionVar: 'myFunctionVal',
        },
      })
      expect(skipping.length).to.equal(0)
    })
  })

  it('returns diff for single network that is executing everything, except SphinxManager', () => {
    const configCache = structuredClone(originalConfigCache)
    configCache.isManagerDeployed = true
    const diff = getDiff(originalParsedConfig, [configCache])

    expect(diff.length).to.equal(1)
    const { networkTags, executing, skipping } = diff[0]
    expect(networkTags).to.deep.equal(['optimism'])
    expect(executing.length).to.equal(3)
    const [constructorOneSig, constructorTwoSig, postDeploySignature] =
      executing
    expect(constructorOneSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(constructorTwoSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract2',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(postDeploySignature).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionVal',
      },
    })
    expect(skipping.length).to.equal(0)
  })

  it('returns diff for single network that is skipping everything', () => {
    const configCache = structuredClone(originalConfigCache)
    configCache.isManagerDeployed = true
    configCache.contractConfigCache.MyContract.isTargetDeployed = true
    configCache.contractConfigCache.MyContract2.isTargetDeployed = true
    configCache.callNonces[callHash] = 1

    const diff = getDiff(originalParsedConfig, [configCache])

    expect(diff.length).to.equal(1)
    const { networkTags, executing, skipping } = diff[0]
    expect(networkTags).to.deep.equal(['optimism'])
    expect(executing.length).to.equal(0)
    expect(skipping.length).to.equal(3)
    const [constructorOneSig, constructorTwoSig, postDeploySignature] = skipping
    expect(constructorOneSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(constructorTwoSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract2',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(postDeploySignature).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionVal',
      },
    })
  })

  it('returns merged diff for networks that are the same', () => {
    const parsedConfig = structuredClone(originalParsedConfig)
    const configCacheTwo = structuredClone(originalConfigCache)
    const configCacheThree = structuredClone(originalConfigCache)

    parsedConfig.contracts['MyContract'].constructorArgs[42161] =
      constructorArgs
    parsedConfig.contracts['MyContract2'].constructorArgs[42161] =
      constructorArgs
    parsedConfig.postDeploy[42161] = [fullPostDeployAction]
    configCacheTwo.chainId = 42161
    configCacheTwo.networkName = 'arbitrum'

    parsedConfig.contracts['MyContract'].constructorArgs[137] = constructorArgs
    parsedConfig.contracts['MyContract2'].constructorArgs[137] = constructorArgs
    parsedConfig.postDeploy[137] = [fullPostDeployAction]
    configCacheThree.chainId = 137
    configCacheThree.networkName = 'matic'

    const diff = getDiff(parsedConfig, [
      originalConfigCache,
      configCacheTwo,
      configCacheThree,
    ])

    expect(diff.length).to.equal(1)
    const { networkTags, executing, skipping } = diff[0]
    expect(networkTags).to.deep.equal(['optimism', 'arbitrum', 'matic'])
    expect(executing.length).to.equal(4)
    const [
      sphinxManagerSignature,
      constructorOneSig,
      constructorTwoSig,
      postDeploySignature,
    ] = executing
    expect(sphinxManagerSignature).to.deep.equal({
      referenceNameOrAddress: 'SphinxManager',
      functionName: 'constructor',
      variables: {},
    })
    expect(constructorOneSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(constructorTwoSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract2',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(postDeploySignature).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionVal',
      },
    })
    expect(skipping.length).to.equal(0)
  })

  it('returns diff for networks that are different', () => {
    const parsedConfig = structuredClone(originalParsedConfig)
    const configCachePolygon = structuredClone(originalConfigCache)
    const configCacheArbitrum = structuredClone(originalConfigCache)

    // Skip the SphinxManager and the contract deployment on this chain
    parsedConfig.contracts['MyContract'].constructorArgs[137] = constructorArgs
    parsedConfig.contracts['MyContract2'].constructorArgs[137] = constructorArgs
    parsedConfig.postDeploy[137] = [fullPostDeployAction]
    configCachePolygon.chainId = 137
    configCachePolygon.networkName = 'matic'
    configCachePolygon.isManagerDeployed = true
    configCachePolygon.contractConfigCache.MyContract.isTargetDeployed = true

    // Use a different constructor argument for the first contract on this chain
    parsedConfig.contracts['MyContract'].constructorArgs[42161] = {
      myVar: 'myVal2',
      myOtherVar: 'myOtherVal2',
    }
    parsedConfig.contracts['MyContract2'].constructorArgs[42161] =
      constructorArgs
    parsedConfig.postDeploy[42161] = [fullPostDeployAction]
    configCacheArbitrum.chainId = 42161
    configCacheArbitrum.networkName = 'arbitrum'

    const diff = getDiff(parsedConfig, [
      originalConfigCache,
      configCachePolygon,
      configCacheArbitrum,
    ])

    expect(diff.length).to.equal(3)
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
    ] = diff

    expect(networkTagsOptimism).to.deep.equal(['optimism'])
    expect(executingOptimism.length).to.equal(4)
    const [
      sphinxManagerSigOptimism,
      constructorOneSigOptimism,
      constructorTwoSigOptimism,
      postDeploySignatureOptimism,
    ] = executingOptimism
    expect(sphinxManagerSigOptimism).to.deep.equal({
      referenceNameOrAddress: 'SphinxManager',
      functionName: 'constructor',
      variables: {},
    })
    expect(constructorOneSigOptimism).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(constructorTwoSigOptimism).to.deep.equal({
      referenceNameOrAddress: 'MyContract2',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(postDeploySignatureOptimism).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionVal',
      },
    })
    expect(skippingOptimism.length).to.equal(0)

    expect(networkTagsPolygon).to.deep.equal(['matic'])
    expect(executingPolygon.length).to.equal(2)
    const [constructorTwoSig, postDeploySignaturePolygon] = executingPolygon
    expect(constructorTwoSig).to.deep.equal({
      referenceNameOrAddress: 'MyContract2',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(postDeploySignaturePolygon).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionVal',
      },
    })
    expect(skippingPolygon.length).to.equal(1)
    const [constructorSignaturePolygon] = skippingPolygon
    expect(constructorSignaturePolygon).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'constructor',
      variables: constructorArgs,
    })

    expect(networkTagsArbitrum).to.deep.equal(['arbitrum'])
    expect(executingArbitrum.length).to.equal(4)
    const [
      sphinxManagerSignatureArbitrum,
      constructorSigOneArbitrum,
      constructorSigTwoArbitrum,
      postDeploySignatureArbitrum,
    ] = executingArbitrum
    expect(sphinxManagerSignatureArbitrum).to.deep.equal({
      referenceNameOrAddress: 'SphinxManager',
      functionName: 'constructor',
      variables: {},
    })
    expect(constructorSigOneArbitrum).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'constructor',
      variables: {
        myVar: 'myVal2',
        myOtherVar: 'myOtherVal2',
      },
    })
    expect(constructorSigTwoArbitrum).to.deep.equal({
      referenceNameOrAddress: 'MyContract2',
      functionName: 'constructor',
      variables: constructorArgs,
    })
    expect(postDeploySignatureArbitrum).to.deep.equal({
      referenceNameOrAddress: 'MyContract',
      functionName: 'myFunction',
      variables: {
        myFunctionVar: 'myFunctionVal',
      },
    })
    expect(skippingArbitrum.length).to.equal(0)
  })
})
