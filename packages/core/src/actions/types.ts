import { ValidManagerVersion } from '../config'
import { SphinxDiff } from '../diff'

/**
 * Possible action types.
 */
export enum SphinxActionType {
  SET_STORAGE,
  DEPLOY_CONTRACT,
  CALL,
}

/**
 * The status of a given Sphinx action.
 */
export const DeploymentStatus = {
  EMPTY: 0n,
  APPROVED: 1n,
  PROXIES_INITIATED: 2n,
  COMPLETED: 3n,
  CANCELLED: 4n,
  FAILED: 5n,
  INITIAL_ACTIONS_EXECUTED: 6n,
  SET_STORAGE_ACTIONS_EXECUTED: 7n,
}

/**
 * Raw action data (encoded for use on-chain).
 */
export interface RawSphinxAction {
  actionType: SphinxActionType
  index: number
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
  nonce: number
}

export interface SphinxBundles {
  actionBundle: SphinxActionBundle
  targetBundle: SphinxTargetBundle
}

/**
 * Sphinx action.
 */
export type SphinxAction = SetStorageAction | DeployContractAction | CallAction

/**
 * Human-readable Sphinx action.
 */
export type HumanReadableAction = {
  reason: string
  actionType: SphinxActionType
  actionIndex: number
}

/**
 * Set of human-readable Sphinx actions.
 */
export type HumanReadableActions = {
  [index: number]: HumanReadableAction
}

/**
 * Sphinx action that is part of a bundle.
 */
export type BundledSphinxAction = {
  action: RawSphinxAction
  siblings: string[]
  gas: bigint
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
  status: bigint
  numInitialActions: bigint
  numSetStorageActions: bigint
  actionRoot: string
  targetRoot: string
  targets: bigint
  actionsExecuted: bigint
  timeClaimed: bigint
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

export type DeploymentApproval = {
  actionRoot: string
  targetRoot: string
  numInitialActions: number
  numSetStorageActions: number
  numTargets: number
  configUri: string
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
export enum AuthLeafType {
  SETUP,
  PROPOSE,
  EXPORT_PROXY,
  SET_OWNER,
  SET_THRESHOLD,
  TRANSFER_MANAGER_OWNERSHIP,
  UPGRADE_MANAGER_IMPLEMENTATION,
  UPGRADE_AUTH_IMPLEMENTATION,
  UPGRADE_MANAGER_AND_AUTH_IMPL,
  SET_PROPOSER,
  APPROVE_DEPLOYMENT,
  CANCEL_ACTIVE_DEPLOYMENT,
}

export const AuthStatus = {
  EMPTY: 0n,
  SETUP: 1n,
  PROPOSED: 2n,
  COMPLETED: 3n,
}

export type AuthState = {
  status: typeof AuthStatus
  leafsExecuted: bigint
  numLeafs: bigint
}

interface Setup extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.SETUP
  proposers: Array<SetRoleMember>
  numLeafs: number
}

interface ExportProxy extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.EXPORT_PROXY
  proxy: string
  contractKindHash: string
  newOwner: string
}

interface SetOwner extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.SET_OWNER
  owner: string
  add: boolean
}

interface SetThreshold extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.SET_THRESHOLD
  newThreshold: number
}

interface TransferManagerOwnership extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.TRANSFER_MANAGER_OWNERSHIP
  newOwner: string
}

interface UpgradeManagerImplementation extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.UPGRADE_MANAGER_IMPLEMENTATION
  impl: string
  data: string
}

interface UpgradeAuthImplementation extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.UPGRADE_AUTH_IMPLEMENTATION
  impl: string
  data: string
}

export interface UpgradeAuthAndManagerImpl extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.UPGRADE_MANAGER_AND_AUTH_IMPL
  managerImpl: string
  managerInitCallData: string
  authImpl: string
  authInitCallData: string
}

interface SetProposer extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.SET_PROPOSER
  proposer: string
  add: boolean
}

export interface ApproveDeployment extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.APPROVE_DEPLOYMENT
  approval: DeploymentApproval
}

export interface CancelActiveDeployment extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.CANCEL_ACTIVE_DEPLOYMENT
}

interface Propose extends BaseAuthLeaf {
  leafType: AuthLeafFunctions.PROPOSE
  numLeafs: number
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
 * @param canonicalConfig The stringified CanonicalConfig that would be generated if this proposal
 * is completely executed.
 * @param gasEstimates The estimated amount of gas required to the entire auth tree on each chain,
 * including a buffer.
 */
export type ProposalRequest = {
  apiKey: string
  orgId: string
  isTestnet: boolean
  owners: string[]
  threshold: number
  authAddress: string
  managerAddress: string
  managerVersion: ValidManagerVersion
  deploymentName: string
  chainIds: Array<number>
  canonicalConfig: string
  projectDeployments: Array<ProjectDeployment>
  gasEstimates: Array<{ chainId: number; estimatedGas: string }>
  diff: SphinxDiff
  tree: {
    root: string
    chainStatus: Array<{
      numLeaves: number
      chainId: number
    }>
    leaves: Array<ProposalRequestLeaf>
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
