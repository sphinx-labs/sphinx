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
  INITIAL_ACTIONS_EXECUTED: 2n,
  PROXIES_INITIATED: 3n,
  SET_STORAGE_ACTIONS_EXECUTED: 4n,
  COMPLETED: 5n,
  CANCELLED: 6n,
  FAILED: 7n,
}

/**
 * Raw action data (encoded for use on-chain).
 */
export interface RawSphinxAction {
  actionType: SphinxActionType
  index: number
  data: string
  addr: string
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
  addr: string
  contractKindHash: string
  index: number
  key: string
  offset: number
  value: string
}

/**
 * DeployContract action data.
 */
export interface DeployContractAction {
  addr: string
  index: number
  salt: string
  code: string
}

export interface CallAction {
  addr: string
  index: number
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
  leafType: 'setup'
  proposers: Array<SetRoleMember>
  numLeafs: number
}

interface ExportProxy extends BaseAuthLeaf {
  leafType: 'exportProxy'
  proxy: string
  contractKindHash: string
  newOwner: string
}

interface SetOwner extends BaseAuthLeaf {
  leafType: 'setOwner'
  owner: string
  add: boolean
}

interface SetThreshold extends BaseAuthLeaf {
  leafType: 'setThreshold'
  newThreshold: number
}

interface TransferManagerOwnership extends BaseAuthLeaf {
  leafType: 'transferManagerOwnership'
  newOwner: string
}

interface UpgradeManagerImplementation extends BaseAuthLeaf {
  leafType: 'upgradeManagerImplementation'
  impl: string
  data: string
}

interface UpgradeAuthImplementation extends BaseAuthLeaf {
  leafType: 'upgradeAuthImplementation'
  impl: string
  data: string
}

interface UpgradeAuthAndManagerImpl extends BaseAuthLeaf {
  leafType: 'upgradeManagerAndAuthImpl'
  managerImpl: string
  managerData: string
  authImpl: string
  authData: string
}

interface SetProposer extends BaseAuthLeaf {
  leafType: 'setProposer'
  proposer: string
  add: boolean
}

export interface ApproveDeployment extends BaseAuthLeaf {
  leafType: 'approveDeployment'
  approval: DeploymentApproval
}

interface CancelActiveDeployment extends BaseAuthLeaf {
  leafType: 'cancelActiveDeployment'
  projectName: string
}

interface Propose extends BaseAuthLeaf {
  leafType: 'propose'
  numLeafs: number
}

export type AuthLeaf =
  | Setup
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
  | Propose

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

export type ProjectDeployment = {
  chainId: number
  deploymentId: string
  name: string // project name
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
