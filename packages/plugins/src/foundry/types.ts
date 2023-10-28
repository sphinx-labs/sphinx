import { CompilerConfig } from '@sphinx-labs/core'
import {
  BundledAuthLeaf,
  HumanReadableAction,
  SphinxActionBundle,
  SphinxTargetBundle,
} from '@sphinx-labs/core/dist/actions/types'

export type BundleInfo = {
  networkName: string
  configUri: string
  authLeafs: Array<BundledAuthLeaf>
  actionBundle: SphinxActionBundle
  targetBundle: SphinxTargetBundle
  humanReadableActions: Array<HumanReadableAction>
  compilerConfig: CompilerConfig
}

export type ProposalOutput = {
  proposerAddress: string
  metaTxnSignature: string
  bundleInfoArray: Array<BundleInfo>
  authRoot: string
}

/**
 * This is the format of the JSON file that is output in a Forge dry run. This type doesn't include
 * the "contractAddress" field that exists in the actual broadcast file because it can be `null` for
 * low-level calls, so we prefer to always use the 'transactions.to' field instead.
 *
 * @param contractName The name of the contract that the transaction is calling. If this is a
 * string, it'll be the contract's name if it's unique in the repo. Otherwise, it'll be the fully
 * qualified name.
 * @param function The name of the function that the transaction is calling. For example,
 * "myFunction(uint256)".
 */
export type FoundryDryRunTransaction = {
  hash: string | null
  transactionType: 'CREATE' | 'CALL'
  contractName: string | null
  function: string | null
  arguments: Array<any> | null
  transaction: {
    type: string
    from: string
    gas: string
    value: string
    data: string
    nonce: string
    accessList: string
    // Defined if `transactionType` is 'CALL'. Undefined if `transactionType` is 'CREATE'.
    to?: string
  }
  additionalContracts: Array<any>
  isFixedGasLimit: boolean
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
