import { BigNumber } from 'ethers'

/**
 * Possible action types.
 */
export enum ChugSplashActionType {
  SET_STORAGE,
  DEPLOY_CONTRACT,
}

/**
 * The status of a given ChugSplash action.
 */
export enum DeploymentStatus {
  EMPTY,
  PROPOSED,
  APPROVED,
  INITIATED,
  COMPLETED,
  CANCELLED,
}

/**
 * Raw action data (encoded for use on-chain).
 */
export interface RawChugSplashAction {
  actionType: ChugSplashActionType
  referenceName: string
  data: string
  addr: string
  contractKindHash: string
}

export interface ChugSplashTarget {
  projectName: string
  referenceName: string
  addr: string
  implementation: string
  contractKindHash: string
}

/**
 * SetStorage action data.
 */
export interface SetStorageAction {
  referenceName: string
  addr: string
  contractKindHash: string
  key: string
  offset: number
  value: string
}

/**
 * DeployContract action data.
 */
export interface DeployContractAction {
  referenceName: string
  addr: string
  contractKindHash: string
  code: string
}

export interface ChugSplashMerkleTrees {
  actionTree: ChugSplashActionTree
  targetTree: ChugSplashTargetTree
}

/**
 * ChugSplash action.
 */
export type ChugSplashAction = SetStorageAction | DeployContractAction

/**
 * Action with its Merkle proof.
 */
export type ActionWithProof = {
  action: RawChugSplashAction
  proof: {
    actionIndex: number
    siblings: string[]
  }
}

/**
 * Target with its Merkle proof.
 */
export interface TargetWithProof {
  target: ChugSplashTarget
  siblings: string[]
}

/**
 * Merkle tree of ChugSplash actions.
 */
export interface ChugSplashActionTree {
  root: string
  actions: ActionWithProof[]
}

/**
 * Merkle tree of ChugSplash actions.
 */
export interface ChugSplashTargetTree {
  root: string
  targets: TargetWithProof[]
}

/**
 * The state of a ChugSplash deployment.
 */
export type ChugSplashDeploymentState = {
  status: DeploymentStatus
  actions: boolean[]
  actionRoot: string
  targetRoot: string
  targets: number
  actionsExecuted: BigNumber
  timeClaimed: BigNumber
  selectedExecutor: string
  remoteExecution: boolean
}
