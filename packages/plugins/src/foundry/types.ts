import { SphinxBundle } from '@sphinx-labs/contracts'
import {
  CompilerConfigWithUri,
  FoundryBroadcastTransaction,
  FoundryDryRunTransaction,
} from '@sphinx-labs/core'

export type BundleInfo = {
  bundle: SphinxBundle
  compilerConfigs: Array<CompilerConfigWithUri>
}

export type ProposalOutput = {
  proposerAddress: string
  metaTxnSignature: string
  bundleInfoArray: Array<BundleInfo>
  authRoot: string
}

export type FoundryBroadcastReceipt = {
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockNumber: string
  from: string
  cumulativeGasUsed: string
  gasUsed: string
  to?: string
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

export type FoundryBroadcast = {
  transactions: Array<FoundryBroadcastTransaction>
  receipts: Array<FoundryBroadcastReceipt>
  libraries: Array<any>
  pending: Array<any>
  returns: any
  timestamp: number
  chain: number
  multi: boolean
  commit: string
}

export type FoundryDryRun = {
  transactions: Array<FoundryDryRunTransaction>
  receipts: Array<any>
  libraries: Array<any>
  pending: Array<any>
  returns: any
  timestamp: number
  chain: number
  multi: boolean
  commit: string
}
