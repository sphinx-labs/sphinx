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
  prettyLeaf: AuthLeaf
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
  to: string
  index: number
}

export interface RawAuthLeaf {
  chainId: number
  to: string
  index: number
  data: string
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
  SETUP,
  PROPOSED,
  COMPLETED,
}

export type AuthState = {
  status: AuthStatus
  leafsExecuted: BigNumber
  numLeafs: BigNumber
}

interface Setup extends BaseAuthLeaf {
  leafType: 'setup'
  proposers: Array<SetRoleMember>
  managers: Array<SetRoleMember>
  numLeafs: number
}

interface SetProjectManager extends BaseAuthLeaf {
  leafType: 'setProjectManager'
  projectManager: string
  add: boolean
}

interface ExportProxy extends BaseAuthLeaf {
  leafType: 'exportProxy'
  proxy: string
  contractKindHash: string
  newOwner: string
}

interface SetOrgOwner extends BaseAuthLeaf {
  leafType: 'setOrgOwner'
  orgOwner: string
  add: boolean
}

interface SetOrgThreshold extends BaseAuthLeaf {
  leafType: 'setOrgThreshold'
  newThreshold: number
}

interface TransferDeployerOwnership extends BaseAuthLeaf {
  leafType: 'transferDeployerOwnership'
  newOwner: string
}

interface UpgradeDeployerImplementation extends BaseAuthLeaf {
  leafType: 'upgradeDeployerImplementation'
  impl: string
  data: string
}

interface UpgradeAuthImplementation extends BaseAuthLeaf {
  leafType: 'upgradeAuthImplementation'
  impl: string
  data: string
}

interface UpgradeAuthAndDeployerImpl extends BaseAuthLeaf {
  leafType: 'upgradeDeployerAndAuthImpl'
  deployerImpl: string
  deployerData: string
  authImpl: string
  authData: string
}

interface CreateProject extends BaseAuthLeaf {
  leafType: 'createProject'
  projectName: string
  projectThreshold: number
  projectOwners: string[]
  contractsToImport: ContractInfo[]
}

interface SetProposer extends BaseAuthLeaf {
  leafType: 'setProposer'
  proposer: string
  add: boolean
}

interface WithdrawETH extends BaseAuthLeaf {
  leafType: 'withdrawETH'
  receiver: string
}

export interface ApproveDeployment extends BaseAuthLeaf {
  leafType: 'approveDeployment'
  projectName: string
  actionRoot: string
  targetRoot: string
  numActions: number
  numTargets: number
  numImmutableContracts: number
  configUri: string
}

interface SetProjectThreshold extends BaseAuthLeaf {
  leafType: 'setProjectThreshold'
  projectName: string
  newThreshold: number
}

interface SetProjectOwner extends BaseAuthLeaf {
  leafType: 'setProjectOwner'
  projectName: string
  projectOwner: string
  add: boolean
}

interface RemoveProject extends BaseAuthLeaf {
  leafType: 'removeProject'
  projectName: string
  contractAddresses: string[]
}

interface CancelActiveDeployment extends BaseAuthLeaf {
  leafType: 'cancelActiveDeployment'
  projectName: string
}

interface UpdateContractsInProject extends BaseAuthLeaf {
  leafType: 'updateContractsInProject'
  projectName: string
  contractAddresses: string[]
  addContract: boolean[]
}

interface Propose extends BaseAuthLeaf {
  leafType: 'propose'
  numLeafs: number
}

export type AuthLeaf =
  | Setup
  | SetProjectManager
  | ExportProxy
  | SetOrgOwner
  | SetOrgThreshold
  | TransferDeployerOwnership
  | UpgradeDeployerImplementation
  | UpgradeAuthImplementation
  | UpgradeAuthAndDeployerImpl
  | CreateProject
  | SetProposer
  | WithdrawETH
  | ApproveDeployment
  | SetProjectThreshold
  | SetProjectOwner
  | RemoveProject
  | CancelActiveDeployment
  | UpdateContractsInProject
  | Propose

export enum RoleType {
  ORG_OWNER,
  MANAGER,
  PROJECT_OWNER,
  PROPOSER,
}

type IPFSHash = string
export type IPFSCommitResponse = IPFSHash[]

/**
 * @param orgCanonicalConfig The stringified CanonicalOrgConfig that would be generated if this
 * proposal were to be approved and completely executed.
 */
export type ProposalRequest = {
  apiKey: string
  orgId: string
  orgOwners: string[]
  orgOwnerThreshold: number
  authAddress: string
  deployerAddress: string
  chainIds: Array<number>
  orgCanonicalConfig: string
  projectDeployments: Array<ProjectDeployments>
  orgTree: {
    root: string
    chainStatus: Array<{
      numLeaves: number
      chainId: number
    }>
    leaves: Array<ProposalRequestLeaf>
  }
}

export type ProjectDeployments = {
  chainId: number
  deploymentId: string
  name: string // project name
  estimatedGas: string // gasUsed, not gas price
}

export type ProposalRequestLeaf = {
  chainId: number
  to: string
  index: number
  data: string
  siblings: Array<string>
  signers: Array<{
    address: string
    signature: string | undefined
  }>
  threshold: number
  leafType: string
}
