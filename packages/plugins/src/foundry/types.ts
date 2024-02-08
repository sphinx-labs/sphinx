import {
  FoundryBroadcastTransaction,
  FoundryDryRunTransaction,
} from '@sphinx-labs/core'

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
