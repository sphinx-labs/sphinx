import {
  ContractArtifact,
  ImmutableReferences,
  LinkReferences,
} from '@sphinx-labs/contracts'
import {
  FoundryBroadcastTransaction,
  FoundryDryRunTransaction,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

export type FoundryTransactionReceipt = {
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockNumber: string
  from: string
  cumulativeGasUsed: string
  gasUsed: string
  to: string | null
  contractAddress: string | null
  logs: Array<{
    address: string
    topics: Array<string>
    data: string
    blockHash: string
    blockNumber: string
    transactionHash: string
    transactionIndex: string
    logIndex: string
    transactionLogIndex: string
    removed: boolean
  }>
  status: string
  logsBloom: string
  type: string
  effectiveGasPrice: string
}

export type FoundrySingleChainBroadcast = {
  transactions: Array<FoundryBroadcastTransaction>
  receipts: Array<FoundryTransactionReceipt>
  libraries: Array<string>
  pending: Array<any>
  returns: any
  timestamp: number
  chain: number
  multi: boolean
  commit: string
}

export type FoundryMultiChainDryRun = {
  deployments: Array<FoundrySingleChainDryRun>
}

export type FoundrySingleChainDryRun = {
  transactions: Array<FoundryDryRunTransaction>
  receipts: Array<any>
  libraries: Array<string>
}

export type FoundryToml = {
  src: string
  test: string
  script: string
  solc: string
  broadcastFolder: string
  artifactFolder: string
  buildInfoFolder: string
  deploymentFolder: string
  cachePath: string
  alwaysUseCreate2Factory: boolean | undefined
  buildInfo: boolean
  extraOutput: Array<string>
  rpcEndpoints: { [networkName: string]: string | undefined }
  remappings: Record<string, string>
  etherscan: {
    [networkName: string]: {
      key: string
    }
  }
}

/**
 * A function type that returns `true` if the `actualBytecode` and the corresponding contract
 * bytecode in the `artifact` have an exact match. Returns `false` otherwise. This function type can
 * be used for either contract init code or deployed bytecode. This is useful for creating logic that
 * works with either type of bytecode.
 */
export type IsBytecodeInArtifact = (
  actualBytecode: string,
  artifact: ContractArtifact
) => boolean

export type BuildInfoCache = {
  _format: 'sphinx-build-info-cache-1'
  entries: Record<string, BuildInfoCacheEntry>
}

/**
 * @field contracts An array where each element corresponds to a contract in the
 * `BuildInfo.output.contracts` object. We use this array to match collected contract init code and
 * runtime bytecode to the corresponding artifact.
 */
export type BuildInfoCacheEntry = {
  name: string
  time: number
  contracts: Array<{
    fullyQualifiedName: string
    bytecode: string
    deployedBytecode: string
    linkReferences: LinkReferences
    deployedLinkReferences: LinkReferences
    immutableReferences: ImmutableReferences
    constructorFragment?: ethers.ConstructorFragment
  }>
}
