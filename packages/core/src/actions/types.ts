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
 * Auth leaf that is part of a bundle.
 */
export type BundledAuthLeaf = {
  leaf: RawAuthLeaf
  proof: string[]
}

/**
 * Bundle of auth leafs.
 */
export interface AuthLeafBundle {
  root: string
  leafs: BundledAuthLeaf[]
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

export interface BaseAuthLeaf {
  chainId: number
  from: string
  to: string
  index: number
}

export interface RawAuthLeaf {
  chainId: number
  from: string
  to: string
  index: number
  data: string
}

export enum AuthLeafType {
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

export enum AuthStatus {
  EMPTY,
  PROPOSED,
  COMPLETED,
}

export type AuthState = {
  status: AuthStatus
  leafsExecuted: BigNumber
  numLeafs: BigNumber
}

interface Setup extends BaseAuthLeaf {
  leafType: AuthLeafType.SETUP
  proposers: Array<SetRoleMember>
  projectManagers: Array<SetRoleMember>
}

interface SetProjectManager extends BaseAuthLeaf {
  leafType: AuthLeafType.SET_PROJECT_MANAGER
  projectManager: string
  add: boolean
}

interface ExportProxy extends BaseAuthLeaf {
  leafType: AuthLeafType.EXPORT_PROXY
  proxy: string
  contractKindHash: string
  newOwner: string
}

interface AddProposer extends BaseAuthLeaf {
  leafType: AuthLeafType.ADD_PROPOSER
  proposer: string
}

interface SetOrgOwner extends BaseAuthLeaf {
  leafType: AuthLeafType.SET_ORG_OWNER
  orgOwner: string
  add: boolean
}

interface UpdateProject extends BaseAuthLeaf {
  leafType: AuthLeafType.UPDATE_PROJECT
  projectName: string
  projectOwnersToRemove: string[]
  newThreshold: number
  newProjectOwners: string[]
}

interface SetOrgOwnerThreshold extends BaseAuthLeaf {
  leafType: AuthLeafType.SET_ORG_OWNER_THRESHOLD
  newThreshold: number
}

interface TransferDeployerOwnership extends BaseAuthLeaf {
  leafType: AuthLeafType.TRANSFER_DEPLOYER_OWNERSHIP
  newOwner: string
}

interface UpgradeDeployerImplementation extends BaseAuthLeaf {
  leafType: AuthLeafType.UPGRADE_DEPLOYER_IMPLEMENTATION
  impl: string
  data: string
}

interface UpgradeAuthImplementation extends BaseAuthLeaf {
  leafType: AuthLeafType.UPGRADE_AUTH_IMPLEMENTATION
  impl: string
  data: string
}

interface UpgradeAuthAndDeployerImpl extends BaseAuthLeaf {
  leafType: AuthLeafType.UPDATE_DEPLOYER_AND_AUTH_IMPLEMENTATION
  deployerImpl: string
  deployerData: string
  authImpl: string
  authData: string
}

interface CreateProject extends BaseAuthLeaf {
  leafType: AuthLeafType.CREATE_PROJECT
  projectName: string
  threshold: number
  projectOwners: string[]
  contractInfoArray: ContractInfo[]
}

interface RemoveProposer extends BaseAuthLeaf {
  leafType: AuthLeafType.REMOVE_PROPOSER
  proposerToRemove: string
}

interface WithdrawETH extends BaseAuthLeaf {
  leafType: AuthLeafType.WITHDRAW_ETH
  receiver: string
}

interface ApproveDeployment extends BaseAuthLeaf {
  leafType: AuthLeafType.APPROVE_DEPLOYMENT
  projectName: string
  actionRoot: string
  targetRoot: string
  numActions: number
  numTargets: number
  numImmutableContracts: number
  configUri: string
}

interface SetProjectThreshold extends BaseAuthLeaf {
  leafType: AuthLeafType.SET_PROJECT_THRESHOLD
  projectName: string
  newThreshold: number
}

interface SetProjectOwner extends BaseAuthLeaf {
  leafType: AuthLeafType.SET_PROJECT_OWNER
  projectName: string
  projectOwner: string
  add: boolean
}

interface RemoveProject extends BaseAuthLeaf {
  leafType: AuthLeafType.REMOVE_PROJECT
  projectName: string
  addresses: string[]
}

interface CancelActiveDeployment extends BaseAuthLeaf {
  leafType: AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT
  projectName: string
}

interface UpdateContractsInProject extends BaseAuthLeaf {
  leafType: AuthLeafType.UPDATE_CONTRACTS_IN_PROJECT
  projectName: string
  contractAddresses: string[]
  addContract: boolean[]
}

interface Propose extends BaseAuthLeaf {
  leafType: AuthLeafType.PROPOSE
  numLeafs: number
}

export type AuthLeaf =
  | Setup
  | SetProjectManager
  | ExportProxy
  | AddProposer
  | SetOrgOwner
  | UpdateProject
  | SetOrgOwnerThreshold
  | TransferDeployerOwnership
  | UpgradeDeployerImplementation
  | UpgradeAuthImplementation
  | UpgradeAuthAndDeployerImpl
  | CreateProject
  | RemoveProposer
  | WithdrawETH
  | ApproveDeployment
  | SetProjectThreshold
  | SetProjectOwner
  | RemoveProject
  | CancelActiveDeployment
  | UpdateContractsInProject
  | Propose
