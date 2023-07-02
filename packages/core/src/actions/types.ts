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
  PROXIES_INITIATED,
  COMPLETED,
  CANCELLED,
  FAILED,
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
  salt: string
  code: string
}

export interface ChugSplashBundles {
  actionBundle: ChugSplashActionBundle
  targetBundle: ChugSplashTargetBundle
}

/**
 * ChugSplash action.
 */
export type ChugSplashAction = SetStorageAction | DeployContractAction

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
 * Auth action that is part of a bundle.
 */
export type BundledAuthAction = {
  action: RawAuthAction
  proof: {
    actionIndex: number
    siblings: string[]
  }
}

/**
 * Bundle of auth actions.
 */
export interface AuthActionBundle {
  root: string
  actions: BundledAuthAction[]
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
export type DeploymentState = {
  status: DeploymentStatus
  actions: boolean[]
  actionRoot: string
  targetRoot: string
  numImmutableContracts: number
  targets: number
  actionsExecuted: BigNumber
  timeClaimed: BigNumber
  selectedExecutor: string
  remoteExecution: boolean
  configUri: string
}

export interface BaseAuthAction {
  chainId: number
  from: string
  to: string
  nonce: number
}

export interface ApproveDeploymentAction extends BaseAuthAction {
  projectName: string
  actionRoot: string
  targetRoot: string
  numActions: number
  numTargets: number
  numImmutableContracts: number
  configUri: string
}

export interface RawAuthAction {
  chainId: number
  from: string
  to: string
  nonce: number
  data: string
}

// TODO: mv
export enum AuthActionType {
  ADD_PROPOSER,
  APPROVE_DEPLOYMENT,
  CANCEL_ACTIVE_DEPLOYMENT,
  CREATE_PROJECT,
  EXPORT_PROXY,
  PROPOSE,
  REMOVE_PROJECT,
  REMOVE_PROPOSER,
  SET_ORG_OWNER,
  SET_ORG_OWNER_THRESHOLD,
  SET_PROJECT_MANAGER,
  SET_PROJECT_OWNER,
  SET_PROJECT_THRESHOLD,
  SETUP,
  TRANSFER_DEPLOYER_OWNERSHIP,
  UPDATE_CONTRACTS_IN_PROJECT,
  UPDATE_PROJECT,
  UPGRADE_AUTH_IMPLEMENTATION,
  UPDATE_DEPLOYER_AND_AUTH_IMPLEMENTATION,
  UPGRADE_DEPLOYER_IMPLEMENTATION,
  WITHDRAW_ETH,
}

export type SetRoleMember = {
  member: string
  add: boolean
}

export type ContractInfo = {
  referenceName: string
  addr: string
}

export interface SetupAuthAction extends BaseAuthAction {
  actionType: AuthActionType.SETUP
  proposers: Array<SetRoleMember>
  projectManagers: Array<SetRoleMember>
  numLeafs: number
}

export interface SetProjectManagerAuthAction extends BaseAuthAction {
  actionType: AuthActionType.SET_PROJECT_MANAGER
  projectManager: string
  add: boolean
}

export interface ExportProxyAuthAction extends BaseAuthAction {
  actionType: AuthActionType.EXPORT_PROXY
  proxy: string
  contractKindHash: string
  newOwner: string
}

export interface AddProposerAuthAction extends BaseAuthAction {
  actionType: AuthActionType.ADD_PROPOSER
  proposer: string
}

export interface SetOrgOwnerAuthAction extends BaseAuthAction {
  actionType: AuthActionType.SET_ORG_OWNER
  orgOwner: string
  add: boolean
}

export interface UpdateProjectAuthAction extends BaseAuthAction {
  actionType: AuthActionType.UPDATE_PROJECT
  projectName: string
  projectOwnersToRemove: string[]
  newThreshold: number
  newProjectOwners: string[]
}

export interface SetOrgOwnerThreshold extends BaseAuthAction {
  actionType: AuthActionType.SET_ORG_OWNER_THRESHOLD
  newThreshold: number
}

export interface TransferDeployerOwnershipAuthAction extends BaseAuthAction {
  actionType: AuthActionType.TRANSFER_DEPLOYER_OWNERSHIP
  newOwner: string
}

export interface UpgradeDeployerImplementationAuthAction
  extends BaseAuthAction {
  actionType: AuthActionType.UPGRADE_DEPLOYER_IMPLEMENTATION
  impl: string
  data: string
}

export interface UpgradeAuthImplementationAuthAction extends BaseAuthAction {
  actionType: AuthActionType.UPGRADE_AUTH_IMPLEMENTATION
  impl: string
  data: string
}

export interface UpgradeAuthAndDeployerImplAuthAction extends BaseAuthAction {
  actionType: AuthActionType.UPDATE_DEPLOYER_AND_AUTH_IMPLEMENTATION
  deployerImpl: string
  deployerData: string
  authImpl: string
  authData: string
}

export interface CreateProjectAuthAction extends BaseAuthAction {
  actionType: AuthActionType.CREATE_PROJECT
  projectName: string
  threshold: number
  projectOwners: string[]
  contractInfoArray: ContractInfo[]
}

export interface RemoveProposerAuthAction extends BaseAuthAction {
  actionType: AuthActionType.REMOVE_PROPOSER
  proposerToRemove: string
}

export interface WithdrawETHAuthAction extends BaseAuthAction {
  actionType: AuthActionType.WITHDRAW_ETH
  receiver: string
}

export interface ApproveDeploymentAuthAction extends BaseAuthAction {
  actionType: AuthActionType.APPROVE_DEPLOYMENT
  projectName: string
  actionRoot: string
  targetRoot: string
  numActions: number
  numTargets: number
  numImmutableContracts: number
  configUri: string
}

export interface SetProjectThresholdAuthAction extends BaseAuthAction {
  actionType: AuthActionType.SET_PROJECT_THRESHOLD
  projectName: string
  newThreshold: number
}

export interface SetProjectOwnerAuthAction extends BaseAuthAction {
  actionType: AuthActionType.SET_PROJECT_OWNER
  projectName: string
  projectOwner: string
  add: boolean
}

export interface RemoveProjectAuthAction extends BaseAuthAction {
  actionType: AuthActionType.REMOVE_PROJECT
  projectName: string
  addresses: string[]
}

export interface CancelActiveDeploymentAuthAction extends BaseAuthAction {
  actionType: AuthActionType.CANCEL_ACTIVE_DEPLOYMENT
  projectName: string
}

export interface UpdateContractsInProjectAuthAction extends BaseAuthAction {
  actionType: AuthActionType.UPDATE_CONTRACTS_IN_PROJECT
  projectName: string
  contractAddresses: string[]
  addContract: boolean[]
}

export interface ProposeAuthAction extends BaseAuthAction {
  actionType: AuthActionType.PROPOSE
  authRootToPropose: string
  numActions: number
  numLeafs: number
}

export type AuthAction =
  | SetupAuthAction
  | SetProjectManagerAuthAction
  | ExportProxyAuthAction
  | AddProposerAuthAction
  | SetOrgOwnerAuthAction
  | UpdateProjectAuthAction
  | SetOrgOwnerThreshold
  | TransferDeployerOwnershipAuthAction
  | UpgradeDeployerImplementationAuthAction
  | UpgradeAuthImplementationAuthAction
  | UpgradeAuthAndDeployerImplAuthAction
  | CreateProjectAuthAction
  | RemoveProposerAuthAction
  | WithdrawETHAuthAction
  | ApproveDeploymentAuthAction
  | SetProjectThresholdAuthAction
  | SetProjectOwnerAuthAction
  | RemoveProjectAuthAction
  | CancelActiveDeploymentAuthAction
  | UpdateContractsInProjectAuthAction
  | ProposeAuthAction
