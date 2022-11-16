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
  target: string
  data: string
}

/**
 * SetStorage action data.
 */
export interface SetStorageAction {
  target: string
  key: string
  value: string
}

/**
 * DeployImplementation action data.
 */
export interface DeployImplementationAction {
  target: string
  code: string
}

/**
 * SetImplementation action data.
 */
export interface SetImplementationAction {
  target: string
}

/**
 * ChugSplash action.
 */
export type ChugSplashAction =
  | SetStorageAction
  | DeployImplementationAction
  | SetImplementationAction

/**
 * Bundle of ChugSplash actions.
 */
export interface ChugSplashActionBundle {
  root: string
  actions: Array<{
    action: RawChugSplashAction
    proof: {
      actionIndex: number
      siblings: string[]
    }
  }>
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
