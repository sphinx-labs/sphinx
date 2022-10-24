/**
 * Possible action types.
 */
export enum ChugSplashActionType {
  SET_CODE,
  SET_STORAGE,
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
 * SetCode action data.
 */
export interface SetCodeAction {
  target: string
  code: string
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
 * ChugSplash action.
 */
export type ChugSplashAction = SetCodeAction | SetStorageAction

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
  total: number
}
