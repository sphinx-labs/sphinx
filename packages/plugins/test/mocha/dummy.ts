import {
  AccountAccess,
  AccountAccessKind,
  Operation,
  SphinxMerkleTree,
} from '@sphinx-labs/contracts'
import {
  ActionInputType,
  BuildInfo,
  BuildInfos,
  CompilerInput,
  ContractDeploymentArtifact,
  Deployment,
  DeploymentArtifacts,
  DeploymentConfig,
  DeploymentContext,
  ExecutionArtifact,
  ExecutionMode,
  NetworkConfig,
  SolcInput,
  SphinxJsonRpcProvider,
  SphinxTransactionReceipt,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import sinon from 'sinon'

import { makeAddress } from './common'

export const dummyChainId = '43211234'
export const dummyMerkleRoot = '0x' + 'fe'.repeat(32)
export const dummyModuleAddress = '0x' + 'df'.repeat(20)
export const dummyUnlabeledAddress = '0x' + 'ad'.repeat(20)
export const dummyContractName = 'DummyContractName'
export const dummyContractArtifactFileName = `${dummyContractName}.json`
export const dummyExecutionArtifactFileName = `${dummyMerkleRoot}.json`
export const dummyBuildInfoId = `dummyBuildInfoId`
export const dummyCompilerInputArtifactFileName = `${dummyBuildInfoId}.json`

export const getDummyEthersTransactionResponse =
  (): ethers.TransactionResponse => {
    const provider = new SphinxJsonRpcProvider(``)
    const response = new ethers.TransactionResponse(
      {
        accessList: [],
        blobVersionedHashes: null,
        blockHash: 'dummyBlockHash',
        blockNumber: 11111,
        chainId: BigInt(1),
        data: 'dummyData',
        from: makeAddress(1),
        gasLimit: BigInt(1),
        gasPrice: BigInt(1),
        hash: 'dummyHash',
        index: 0,
        maxFeePerBlobGas: BigInt(1),
        maxFeePerGas: BigInt(1),
        maxPriorityFeePerGas: BigInt(1),
        nonce: 0,
        signature: ethers.Signature.from(
          '0xa617d0558818c7a479d5063987981b59d6e619332ef52249be8243572ef1086807e381afe644d9bb56b213f6e08374c893db308ac1a5ae2bf8b33bcddcb0f76a1b'
        ),
        to: 'dummyTo',
        type: 0,
        value: BigInt(0),
      },
      provider
    )

    return response
  }

export const getDummySphinxTransactionReceipt =
  (): SphinxTransactionReceipt => {
    return {
      blockHash: 'dummyBlockHash',
      blockNumber: 123,
      contractAddress: null,
      cumulativeGasUsed: 'dummyCumulativeGasUsed',
      from: 'dummyFrom',
      gasPrice: 'dummyGasPrice',
      gasUsed: 'dummyGasUsed',
      hash: 'dummyHash',
      index: 0,
      logs: [
        {
          address: 'dummyLogAddress',
          blockHash: 'dummyLogBlockHash',
          blockNumber: 123,
          data: 'dummyLogData',
          index: 0,
          topics: ['dummyTopic1', 'dummyTopic2'],
          transactionHash: 'dummyTransactionHash',
          transactionIndex: 1,
        },
      ],
      logsBloom: 'dummyLogsBloom',
      status: 1,
      to: 'dummyTo',
    }
  }

export const getDummyMerkleTree = (): SphinxMerkleTree => {
  return {
    root: dummyMerkleRoot,
    leavesWithProofs: [],
  }
}

export const getDummyContractDeploymentArtifact =
  (): ContractDeploymentArtifact => {
    return {
      _format: 'sphinx-sol-ct-artifact-1',
      merkleRoot: dummyMerkleRoot,
      address: 'dummyAddress',
      sourceName: 'dummySourceName',
      contractName: dummyContractName,
      chainId: dummyChainId,
      receipt: getDummySphinxTransactionReceipt(),
      args: [],
      solcInputHash: 'dummySolcInputHash',
      abi: [],
      bytecode: 'dummyBytecode',
      deployedBytecode: 'dummyDeployedBytecode',
      linkReferences: {},
      deployedLinkReferences: {},
      history: [],
      metadata: 'dummyMetadata',
      gitCommit: null,
      devdoc: {},
      userdoc: {},
    }
  }

export const getDummySolcInput = (): SolcInput => {
  return {
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
  }
}

export const getDummyCompilerInput = (): CompilerInput => {
  return {
    id: dummyBuildInfoId,
    solcVersion: '0.8.0',
    solcLongVersion: '0.8.21+commit.d9974bed',
    input: getDummySolcInput(),
  }
}

export const getDummyBuildInfo = (): BuildInfo => {
  return {
    id: dummyBuildInfoId,
    solcVersion: '0.8.0',
    solcLongVersion: '0.8.21+commit.d9974bed',
    input: getDummySolcInput(),
    output: {
      contracts: {},
    },
  }
}

export const getDummyBuildInfos = (): BuildInfos => {
  return { [dummyBuildInfoId]: getDummyBuildInfo() }
}

export const getDummyEventLog = (): SphinxTransactionReceipt['logs'][0] => {
  return {
    address: '0xDummyAddress',
    blockHash: '0xDummyBlockHash',
    blockNumber: 123,
    data: '0xDummyData',
    index: 1,
    topics: [],
    transactionHash: '0xDummyTransactionHash',
    transactionIndex: 0,
  }
}

export const getDummyNetworkConfig = (): NetworkConfig => {
  return {
    safeAddress: '0x' + '11'.repeat(20),
    moduleAddress: dummyModuleAddress,
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
          value: '0',
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
    unlabeledContracts: [
      {
        address: dummyUnlabeledAddress,
        initCodeWithArgs: 'dummyInitCodeWithArgs',
      },
    ],
    arbitraryChain: false,
    libraries: [],
    gitCommit: null,
  }
}

const getDummyExecutionArtifact = (): ExecutionArtifact => {
  return {
    _format: 'sphinx-sol-execution-artifact-1',
    transactions: [],
    merkleRoot: dummyMerkleRoot,
    solcInputHashes: ['dummyHash'],
    safeAddress: 'dummySafeAddress',
    moduleAddress: 'dummyModuleAddress',
    executorAddress: 'dummyExecutorAddress',
    nonce: 'dummyNonce',
    chainId: 'dummyChainId',
    actions: [],
    sphinxConfig: {
      projectName: 'dummyProjectName',
      orgId: 'dummyOrgId',
      owners: ['dummyOwner'],
      mainnets: ['dummyMainnet'],
      testnets: ['dummyTestnet'],
      threshold: 'dummyThreshold',
      saltNonce: 'dummySaltNonce',
    },
    executionMode: ExecutionMode.LocalNetworkCLI,
    initialState: {
      isSafeDeployed: false,
      isModuleDeployed: false,
      isExecuting: false,
    },
    unlabeledContracts: [],
    arbitraryChain: false,
    libraries: [],
    gitCommit: null,
    safeInitData: null,
  }
}

export const getDummyDeploymentConfig = (): DeploymentConfig => {
  return {
    networkConfigs: [getDummyNetworkConfig()],
    merkleTree: getDummyMerkleTree(),
    configArtifacts: {},
    buildInfos: getDummyBuildInfos(),
    inputs: [getDummyCompilerInput()],
    version: 'dummyVersion',
  }
}

export const getDummyDeploymentArtifacts = (): DeploymentArtifacts => {
  const { id, input, solcVersion, solcLongVersion } = getDummyBuildInfo()

  return {
    networks: {
      [dummyChainId]: {
        contractDeploymentArtifacts: {
          [dummyContractArtifactFileName]: getDummyContractDeploymentArtifact(),
        },
        executionArtifacts: {
          [dummyExecutionArtifactFileName]: getDummyExecutionArtifact(),
        },
      },
    },
    compilerInputs: {
      [dummyCompilerInputArtifactFileName]: {
        id,
        input,
        solcLongVersion,
        solcVersion,
      },
    },
  }
}

export const getDummyDeploymentContext = (): DeploymentContext => {
  return {
    throwError: sinon.fake(),
    handleError: sinon.fake(),
    handleAlreadyExecutedDeployment: sinon.fake(),
    handleExecutionFailure: sinon.fake(),
    handleSuccess: sinon.fake(),
    executeTransaction: sinon.fake(),
    injectRoles: sinon.fake(),
    removeRoles: sinon.fake(),
    deployment: getDummyDeployment(),
    provider: new SphinxJsonRpcProvider(``),
    wallet: new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    ),
  }
}

export const getDummyDeployment = (): Deployment => {
  return {
    id: 'dummyId',
    multichainDeploymentId: 'dummyMultichainId',
    projectId: 'dummyProjectId',
    chainId: '1',
    status: 'approved',
    safeAddress: '0xdummySafeAddress',
    moduleAddress: '0xdummyModuleAddress',
    deploymentConfig: getDummyDeploymentConfig(),
    networkName: 'dummyNetwork',
    treeSigners: [],
  }
}

export const getDummyAccountAccess = (): AccountAccess => {
  return {
    chainInfo: {
      forkId: '0x1',
      chainId: '0x3',
    },
    kind: AccountAccessKind.Balance,
    account: '0xAccount',
    accessor: '0xAccessor',
    initialized: true,
    oldBalance: '1000',
    newBalance: '1500',
    deployedCode: '0xCode',
    value: '500',
    data: '0xData',
    reverted: false,
    storageAccesses: [],
  }
}
