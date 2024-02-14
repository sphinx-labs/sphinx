import { ethers } from 'ethers'
import { SphinxLeafWithProof } from '@sphinx-labs/contracts'

import { SphinxPreview } from '../preview'
import { ExecutionMode } from '../constants'
import { DeploymentContext } from './execute'

/**
 * The status of a Merkle root in a Sphinx Module.
 */
export const MerkleRootStatus = {
  EMPTY: BigInt(0),
  APPROVED: BigInt(1),
  COMPLETED: BigInt(2),
  CANCELED: BigInt(3),
  FAILED: BigInt(4),
}

/**
 * Raw action data (encoded for use on-chain).
 */
export interface RawSphinxAction {
  actionType: bigint
  index: bigint
  data: string
}

export interface SphinxTarget {
  addr: string
  implementation: string
  contractKindHash: string
}

/**
 * SetStorage action data.
 */
export interface SetStorageAction {
  index: number
  to: string
  contractKindHash: string
  key: string
  offset: number
  value: string
}

/**
 * DeployContract action data.
 */
export interface DeployContractAction {
  index: number
  salt: string
  creationCodeWithConstructorArgs: string
}

export interface CallAction {
  index: number
  to: string
  data: string
}

export interface CreateAction {
  index: number
  initCode: string
}

/**
 * Sphinx action.
 */
export type SphinxAction =
  | SetStorageAction
  | DeployContractAction
  | CallAction
  | CreateAction

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

export type ParsedContractDeployment = {
  address: string
  fullyQualifiedName: string
  initCodeWithArgs: string
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

export type ContractInfo = {
  referenceName: string
  addr: string
}

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
  compilerConfigId: string | undefined
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
}

export type EstimateGas = (
  moduleAddress: string,
  batch: Array<SphinxLeafWithProof>
) => number

export type ExecuteActions = (
  batch: SphinxLeafWithProof[],
  executionMode: ExecutionMode,
  blockGasLimit: bigint,
  deploymentContext: DeploymentContext
) => Promise<ethers.TransactionReceipt | null>

export type ApproveDeployment = (
  merkleRoot: string,
  approvalLeafWithProof: SphinxLeafWithProof,
  executionMode: ExecutionMode,
  ownerSignatures: Array<string>,
  deploymentContext: DeploymentContext
) => Promise<ethers.TransactionReceipt>
