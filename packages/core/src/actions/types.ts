import { SphinxPreview } from '../preview'

/**
 * Possible action types.
 */
export const SphinxActionType = {
  SET_STORAGE: 0n,
  DEPLOY_CONTRACT: 1n,
  CALL: 2n,
  CREATE: 3n,
}

/**
 * The status of a given Sphinx action.
 */
export const DeploymentStatus = {
  EMPTY: 0n,
  APPROVED: 1n,
  COMPLETED: 2n,
  CANCELED: 3n,
  FAILED: 4n,
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
  actionType: bigint
  actionIndex: bigint
}

/**
 * Sphinx action that is part of a bundle.
 */
export type BundledSphinxAction = {
  action: RawSphinxAction
  contracts: ParsedContractDeployments
  siblings: string[]
  gas: bigint
}

export type ParsedContractDeployments = {
  [address: string]: {
    fullyQualifiedName: string
    initCodeWithArgs: string
  }
}

/**
 * Bundle of Sphinx targets.
 */
export interface BundledSphinxTarget {
  target: SphinxTarget
  siblings: string[]
}

/**
 * Bundle of Sphinx actions.
 */
export interface SphinxActionBundle {
  root: string
  actions: BundledSphinxAction[]
}

export interface BundledAuthLeaf {
  leaf: RawAuthLeaf
  leafTypeEnum: bigint
  leafFunctionName: AuthLeafFunctions
  proof: string[]
}

export interface BundledAuthLeafWithPrettyLeaf extends BundledAuthLeaf {
  prettyLeaf: AuthLeaf
}

/**
 * Bundle of auth leaves.
 */
export interface AuthLeafBundle {
  root: string
  leaves: BundledAuthLeaf[]
}

/**
 * Bundle of Sphinx targets.
 */
export interface SphinxTargetBundle {
  root: string
  targets: BundledSphinxTarget[]
}

/**
 * The state of a Sphinx bundle.
 */
export type DeploymentState = {
  numLeaves: bigint
  leavesExecuted: bigint
  uri: string
  executor: string
  status: bigint
}

export interface BaseAuthLeaf {
  chainId: bigint
  to: string
  index: number
}

export interface RawAuthLeaf {
  chainId: bigint
  to: string
  index: bigint
  data: string
}

export type SetRoleMember = {
  member: string
  add: boolean
}

export type DeploymentApproval = {
  actionRoot: string
  targetRoot: string
  numInitialActions: number
  numSetStorageActions: number
  numTargets: number
  configUri: string
  remoteExecution: boolean
}

export type ContractInfo = {
  referenceName: string
  addr: string
}

export enum AuthLeafFunctions {
  SETUP = 'setup',
  PROPOSE = 'propose',
  EXPORT_PROXY = 'exportProxy',
  SET_OWNER = 'setOwner',
  SET_THRESHOLD = 'setThreshold',
  TRANSFER_MANAGER_OWNERSHIP = 'transferManagerOwnership',
  UPGRADE_MANAGER_IMPLEMENTATION = 'upgradeManagerImplementation',
  UPGRADE_AUTH_IMPLEMENTATION = 'upgradeAuthImplementation',
  UPGRADE_MANAGER_AND_AUTH_IMPL = 'upgradeManagerAndAuthImpl',
  SET_PROPOSER = 'setProposer',
  APPROVE_DEPLOYMENT = 'approveDeployment',
  CANCEL_ACTIVE_DEPLOYMENT = 'cancelActiveDeployment',
}

/**
 * @notice This is in the exact same order as the `AuthLeafType` enum defined in Solidity.
 */
export const AuthLeafType = {
  SETUP: 0n,
  PROPOSE: 1n,
  EXPORT_PROXY: 2n,
  SET_OWNER: 3n,
  SET_THRESHOLD: 4n,
  TRANSFER_MANAGER_OWNERSHIP: 5n,
  UPGRADE_MANAGER_IMPLEMENTATION: 6n,
  UPGRADE_AUTH_IMPLEMENTATION: 7n,
  UPGRADE_MANAGER_AND_AUTH_IMPL: 8n,
  SET_PROPOSER: 9n,
  APPROVE_DEPLOYMENT: 10n,
  CANCEL_ACTIVE_DEPLOYMENT: 11n,
}

export const AuthStatus = {
  EMPTY: 0n,
  SETUP: 1n,
  PROPOSED: 2n,
  COMPLETED: 3n,
}

export type AuthState = {
  status: typeof AuthStatus
  leavesExecuted: bigint
  numLeaves: bigint
}

export interface Setup extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.SETUP
  leafTypeEnum: bigint
  proposers: Array<SetRoleMember>
  numLeaves: number
}

interface ExportProxy extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.EXPORT_PROXY
  leafTypeEnum: bigint
  proxy: string
  contractKindHash: string
  newOwner: string
}

interface SetOwner extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.SET_OWNER
  leafTypeEnum: bigint
  owner: string
  add: boolean
}

interface SetThreshold extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.SET_THRESHOLD
  leafTypeEnum: bigint
  newThreshold: number
}

interface TransferManagerOwnership extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.TRANSFER_MANAGER_OWNERSHIP
  leafTypeEnum: bigint
  newOwner: string
}

interface UpgradeManagerImplementation extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.UPGRADE_MANAGER_IMPLEMENTATION
  leafTypeEnum: bigint
  impl: string
  data: string
}

interface UpgradeAuthImplementation extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.UPGRADE_AUTH_IMPLEMENTATION
  leafTypeEnum: bigint
  impl: string
  data: string
}

export interface UpgradeAuthAndManagerImpl extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.UPGRADE_MANAGER_AND_AUTH_IMPL
  leafTypeEnum: bigint
  managerImpl: string
  managerInitCallData: string
  authImpl: string
  authInitCallData: string
}

interface SetProposer extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.SET_PROPOSER
  leafTypeEnum: bigint
  proposer: string
  add: boolean
}

export interface ApproveDeployment extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.APPROVE_DEPLOYMENT
  leafTypeEnum: bigint
  approval: DeploymentApproval
}

export interface CancelActiveDeployment extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.CANCEL_ACTIVE_DEPLOYMENT
  leafTypeEnum: bigint
}

interface Propose extends BaseAuthLeaf {
  functionName: AuthLeafFunctions.PROPOSE
  leafTypeEnum: bigint
  numLeaves: number
}

export type AuthLeaf =
  | Setup
  | Propose
  | ExportProxy
  | SetOwner
  | SetThreshold
  | TransferManagerOwnership
  | UpgradeManagerImplementation
  | UpgradeAuthImplementation
  | UpgradeAuthAndManagerImpl
  | SetProposer
  | ApproveDeployment
  | CancelActiveDeployment

export enum RoleType {
  OWNER,
  PROPOSER,
}

type IPFSHash = string
export type IPFSCommitResponse = IPFSHash[]

/**
 * @param canonicalConfig Deprecated field.
 * @param gasEstimates The estimated amount of gas required to the entire auth tree on each chain,
 * including a buffer.
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
 * @param isExecuting Whether there's currently an active deployment in the SphinxManager on this
 * chain.
 */
export type ProjectDeployment = {
  chainId: number
  deploymentId: string
  name: string
  isExecuting: boolean
  configUri: string
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
    isProposer: boolean
  }>
  threshold: number
  leafType: string
}
