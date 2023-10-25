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

// TODO(docs): this doesn't include the "contractAddress", which is a field in the actual
// foundry broadcast file. we don't include it here because it can be `null` for low-level calls, so
// we prefer to always use the 'transactions.to' field instead.
export type FoundryDryRunTransaction = {
  hash: string | null
  transactionType: 'CREATE' | 'CALL'
  contractName: string | null // TODO(docs): if string, it'll be contractName if it's unique in repo, otherwise FQN
  function: string | null // TODO(docs): e.g. "myFunction(uint256)"
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
