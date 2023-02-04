import { BigNumber } from 'ethers'

/**
 * Possible action types.
 */
export enum ChugSplashActionType {
  SET_STORAGE,
  DEPLOY_IMPLEMENTATION,
  SET_IMPLEMENTATION,
}

/**
 * The status of a given ChugSplash action.
 */
export enum ChugSplashBundleStatus {
  EMPTY,
  PROPOSED,
  APPROVED,
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
}

/**
 * SetStorage action data.
 */
export interface SetStorageAction {
  referenceName: string
  key: string
  offset: number
  value: string
}

/**
 * DeployImplementation action data.
 */
export interface DeployImplementationAction {
  referenceName: string
  code: string
}

/**
 * SetImplementation action data.
 */
export interface SetImplementationAction {
  referenceName: string
}

/**
 * ChugSplash action.
 */
export type ChugSplashAction =
  | SetStorageAction
  | DeployImplementationAction
  | SetImplementationAction

/**
 * ChugSplash action that is part of a bundle.
 */
export type BundledChugSplashAction = {
  action: RawChugSplashAction
  proof: {
    actionIndex: number
    siblings: string[]
  }
}

/**
 * Bundle of ChugSplash actions.
 */
export interface ChugSplashActionBundle {
  root: string
  actions: BundledChugSplashAction[]
}

/**
 * The state of a ChugSplash bundle.
 */
export type ChugSplashBundleState = {
  status: ChugSplashBundleStatus
  executions: boolean[]
  merkleRoot: string
  actionsExecuted: BigNumber
  timeClaimed: BigNumber
  selectedExecutor: string
}
