import { Operation } from '@sphinx-labs/contracts'

import { SphinxPreview } from '../preview'

/**
 * The status of a Merkle root in a Sphinx Module.
 */
export const MerkleRootStatus = {
  EMPTY: 0n,
  APPROVED: 1n,
  COMPLETED: 2n,
  CANCELED: 3n,
  FAILED: 4n,
}

/**
 * Human-readable Sphinx action.
 */
export type HumanReadableAction = {
  reason: string
  actionIndex: string
}

export type HumanReadableActions = {
  [chainId: number]: Array<HumanReadableAction>
}

/**
 * The state of a Merkle root in a `SphinxModuleProxy`.
 */
export type MerkleRootState = {
  numLeaves: bigint
  leavesExecuted: bigint
  uri: string
  executor: string
  status: bigint
}

type IPFSHash = string
export type IPFSCommitResponse = IPFSHash[]

/**
 * @param canonicalConfig Deprecated field.
 * @param gasEstimates The estimated amount of gas required to the entire deployment tree on each
 * chain, including a buffer.
 */
export type ProposalRequest = {
  apiKey: string
  orgId: string
  isTestnet: boolean
  owners: string[]
  threshold: number
  safeAddress: string
  moduleAddress: string
  safeInitData: string
  safeInitSaltNonce: string
  deploymentName: string
  chainIds: Array<number>
  projectDeployments: Array<ProjectDeployment>
  gasEstimates: Array<{ chainId: number; estimatedGas: string }>
  diff: SphinxPreview
  tree: {
    root: string
    chainStatus: Array<{
      numLeaves: number
      chainId: number
    }>
  }
}

/**
 * @param name The name of the project.
 * @param isExecuting Whether there's currently an active deployment in the SphinxModuleProxy on this
 * chain.
 */
export type ProjectDeployment = {
  chainId: number
  deploymentId: string
  name: string
  isExecuting: boolean
  configUri: string
}

/**
 * @notice TODO(docs)
 *
 * @field to         The destination address.
 * @field value      The amount to send from the Gnosis Safe to the destination address.
 * @field txData     Data to forward to the Gnosis Safe.
 * @field operation  The type of transaction operation.
 */
export type ModuleTransaction = {
  to: string
  value: string
  txData: string
  operation: Operation
}
