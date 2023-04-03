import { BigNumber } from 'ethers'

/**
 * Possible action types.
 */
export enum ChugSplashActionType {
  SET_STORAGE,
  DEPLOY_IMPLEMENTATION,
}

/**
 * The status of a given ChugSplash action.
 */
export enum ChugSplashBundleStatus {
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
  proxy: string
  proxyTypeHash: string
}

export interface ChugSplashTarget {
  projectName: string
  referenceName: string
  proxy: string
  implementation: string
  proxyTypeHash: string
}

/**
 * SetStorage action data.
 */
export interface SetStorageAction {
  referenceName: string
  proxy: string
  proxyTypeHash: string
  key: string
  offset: number
  value: string
}

/**
 * DeployImplementation action data.
 */
export interface DeployImplementationAction {
  referenceName: string
  proxy: string
  proxyTypeHash: string
  code: string
}

export interface ChugSplashBundles {
  actionBundle: ChugSplashActionBundle
  targetBundle: ChugSplashTargetBundle
}

/**
 * ChugSplash action.
 */
export type ChugSplashAction = SetStorageAction | DeployImplementationAction

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
 * Bundle of ChugSplash targets.
 */
export interface BundledChugSplashTarget {
  target: ChugSplashTarget
  siblings: string[]
}

/**
 * Bundle of ChugSplash actions.
 */
export interface ChugSplashActionBundle {
  root: string
  actions: BundledChugSplashAction[]
}

/**
 * Bundle of ChugSplash targets.
 */
export interface ChugSplashTargetBundle {
  root: string
  targets: BundledChugSplashTarget[]
}

/**
 * The state of a ChugSplash bundle.
 */
export type ChugSplashBundleState = {
  status: ChugSplashBundleStatus
  actions: boolean[]
  actionRoot: string
  targetRoot: string
  targets: number
  actionsExecuted: BigNumber
  timeClaimed: BigNumber
  selectedExecutor: string
}
