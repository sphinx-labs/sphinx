import {
  ActionInput,
  ActionInputType,
  ConfigArtifacts,
  DeploymentConfig,
  SphinxTransactionReceipt,
} from '@sphinx-labs/core'
import {
  AccountAccessKind,
  ContractArtifact,
  Operation,
  ParsedAccountAccess,
  SphinxModuleABI,
} from '@sphinx-labs/contracts'
import { EventFragment, ethers } from 'ethers'

import {
  dummyBuildInfoId,
  dummyModuleAddress,
  getDummyAccountAccess,
  getDummyBuildInfos,
  getDummyCompilerInput,
  getDummyEventLog,
  getDummyMerkleTree,
  getDummyNetworkConfig,
  getDummySphinxTransactionReceipt,
} from './dummy'
import { readContractArtifact } from '../../dist'

export const getFakeActionSucceededReceipt = (
  merkleRoot: string
): SphinxTransactionReceipt => {
  const moduleInterface = new ethers.Interface(SphinxModuleABI)
  const actionSucceededFragment = moduleInterface.fragments
    .filter(EventFragment.isFragment)
    .find((fragment) => fragment.name === 'SphinxActionSucceeded')
  if (!actionSucceededFragment) {
    throw new Error(`Could not find event fragment. Should never happen.`)
  }

  const actionIndex = 0
  const logData = moduleInterface.encodeEventLog(actionSucceededFragment, [
    merkleRoot,
    actionIndex,
  ])
  const dummyLog = getDummyEventLog()
  dummyLog.topics = logData.topics
  dummyLog.data = logData.data
  dummyLog.address = dummyModuleAddress

  const receipt = getDummySphinxTransactionReceipt()
  receipt.logs = [dummyLog]
  return receipt
}

export const getFakeConfigArtifacts = async (
  fullyQualifiedNames: Array<string>,
  artifactFolder: string
): Promise<ConfigArtifacts> => {
  const configArtifacts: ConfigArtifacts = {}
  for (const name of fullyQualifiedNames) {
    const artifact = await readContractArtifact(
      name,
      process.cwd(),
      artifactFolder
    )
    configArtifacts[name] = {
      buildInfoId: dummyBuildInfoId,
      artifact,
    }
  }
  return configArtifacts
}

export const getFakeConfigArtifactsFromContractArtifacts = async (
  artifacts: Array<ContractArtifact>
): Promise<ConfigArtifacts> => {
  const configArtifacts: ConfigArtifacts = {}
  for (const artifact of artifacts) {
    const fullyQualifiedName = `${artifact.sourceName}:${artifact.contractName}`
    configArtifacts[fullyQualifiedName] = {
      buildInfoId: dummyBuildInfoId,
      artifact,
    }
  }
  return configArtifacts
}

export const getFakeActionInputWithContract = (
  fullyQualifiedName: string,
  initCodeWithArgs: string
): ActionInput => {
  return {
    contracts: [
      {
        address: '0x' + '22'.repeat(20),
        fullyQualifiedName,
        initCodeWithArgs,
      },
    ],
    index: '0',
    actionType: ActionInputType.CALL,
    decodedAction: {
      referenceName: 'MockReference',
      functionName: 'MockFunction',
      variables: {},
      address: '0x' + '22'.repeat(20),
      value: '0',
    },
    to: '0x' + '66'.repeat(20),
    value: '0',
    txData: '0x',
    gas: '0',
    operation: Operation.Call,
    requireSuccess: true,
  }
}

export const getFakeDeploymentConfig = async (
  chainId: string,
  fullyQualifiedName: string,
  initCodeWithArgs: string,
  artifactFolder: string,
  compilerInputId: string,
  merkleRoot: string
): Promise<DeploymentConfig> => {
  const networkConfig = getDummyNetworkConfig()
  networkConfig.chainId = chainId.toString()
  networkConfig.actionInputs = [
    getFakeActionInputWithContract(fullyQualifiedName, initCodeWithArgs),
  ]

  const compilerInput = getDummyCompilerInput()
  compilerInput.id = compilerInputId

  const merkleTree = getDummyMerkleTree()
  merkleTree.root = merkleRoot

  return {
    networkConfigs: [networkConfig],
    merkleTree,
    configArtifacts: await getFakeConfigArtifacts(
      [fullyQualifiedName],
      artifactFolder
    ),
    buildInfos: getDummyBuildInfos(),
    inputs: [compilerInput],
    version: '0',
  }
}

export const getFakeParsedAccountAccess = (fields: {
  kind: AccountAccessKind
  data: string
  account: string
  deployedCode: string
}): ParsedAccountAccess => {
  const { kind, data, account, deployedCode } = fields
  const root = getDummyAccountAccess()
  root.kind = kind
  root.data = data
  root.account = account
  root.deployedCode = deployedCode

  return {
    root,
    nested: [],
  }
}
