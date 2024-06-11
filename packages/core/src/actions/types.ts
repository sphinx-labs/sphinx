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

export type EstimateGasTransactionData = {
  to: string
  from: string
  data: string
  gasLimit: string
  value: string
  chainId: string
}

/**
 * The estimated cost for a specific transaction during a deployment.
 *
 * @property {object} transaction: The raw transaction data. This is useful for networks that have custom RPC methods for
 * calculating fees such as polygon zkevm.
 * @property {string} estimatedGas: The amount of gas we estimate will be used by this transaction.
 *
 */
export type TransactionEstimatedGas = {
  transaction: EstimateGasTransactionData
  estimatedGas: string
}

/**
 * The estimated cost to execute the deployment on a given network. Includes the overall gas cost with a buffer as well
 * as the raw transaction data used to generate the estimate. We include the transaction data because some networks have
 * more complex fee formulas or custom RPC methods for calculating fees which require more information.
 *
 * Note that the array of transactions contains approximately the transactions we will actually use when executing the
 * deployment and *not* the transactions defined by the user. So this array will contain a transaction to approve the deployment
 * and a series of transactions to execute batches of actions via the users module. The real transactions we end up executing
 * may end up being somewhat different depending on network conditions.
 *
 * @property {number} chainId: The id of the network this estimate is for.
 * @property {string} estimatedGas: The amount of gas we've estimated will be used for the entire deployment including a buffer.
 * @property {string} fundsRequested: The amount of funds that the user has requested be transferred to their Safe on this network.
 * Note that we also have this value stored on the deployment config, but we also include it hear because the deployment config is
 * not easily accessible while the proposal is being processed by the website backend.
 * @property {array} transactions: An array of individual transactions used to generate this estimate along with their estimated
 * gas cost and estimated blob gas cost.
 */
export type NetworkGasEstimate = {
  chainId: number
  estimatedGas: string
  fundsRequested?: string
}

/**
 * @param compilerConfigId Deprecated field.
 */
export type ProposalRequest = {
  apiKey: string
  orgId: string
  isTestnet: boolean
  safeAddress: string
  moduleAddress: string
  projectName: string
  chainIds: Array<number>
  projectDeployments: Array<ProjectDeployment>
  diff: SphinxPreview
  compilerConfigId: string | undefined
  deploymentConfigId: string | undefined
  sphinxPluginVersion: string | undefined
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
  batch: Array<SphinxLeafWithProof>,
  chainId: bigint
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
