import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  IMMUTABLE_TYPE_HASH,
  IMPLEMENTATION_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
  SphinxTransaction,
  ContractArtifact,
  SphinxMerkleTree,
  ParsedAccountAccess,
} from '@sphinx-labs/contracts'

import { BuildInfo, CompilerInput } from '../languages/solidity/types'
import { SphinxJsonRpcProvider } from '../provider'
import { ParsedContractDeployment } from '../actions/types'
import { ExecutionMode } from '../constants'

export const userContractKinds = [
  'oz-transparent',
  'oz-ownable-uups',
  'oz-access-control-uups',
  'external-transparent',
  'immutable',
  'proxy',
]
export type UserContractKind =
  | 'oz-transparent'
  | 'oz-ownable-uups'
  | 'oz-access-control-uups'
  | 'external-transparent'
  | 'immutable'
  | 'proxy'

export const contractKindHashes: { [contractKind: string]: string } = {
  'external-transparent': EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
  'oz-transparent': OZ_TRANSPARENT_PROXY_TYPE_HASH,
  'oz-ownable-uups': OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  'oz-access-control-uups': OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  immutable: IMMUTABLE_TYPE_HASH,
  implementation: IMPLEMENTATION_TYPE_HASH,
  proxy: DEFAULT_PROXY_TYPE_HASH,
}

export type Project = string | 'all'

export type ContractKind = UserContractKind | 'proxy'

export enum ContractKindEnum {
  INTERNAL_DEFAULT,
  OZ_TRANSPARENT,
  OZ_OWNABLE_UUPS,
  OZ_ACCESS_CONTROL_UUPS,
  EXTERNAL_DEFAULT,
  IMMUTABLE,
}

export type ParsedVariable =
  | boolean
  | string
  | number
  | null
  | Array<ParsedVariable>
  | {
      [name: string]: ParsedVariable
    }

export type ActionInput =
  | FunctionCallActionInput
  | Create2ActionInput
  | CreateActionInput

export type NetworkConfig = {
  safeAddress: string
  moduleAddress: string
  executorAddress: string
  safeInitData: string
  nonce: string
  chainId: string
  blockGasLimit: string
  blockNumber: string
  actionInputs: Array<ActionInput>
  newConfig: InternalSphinxConfig
  executionMode: ExecutionMode
  initialState: InitialChainState
  isSystemDeployed: boolean
  unlabeledContracts: Array<{
    address: string
    initCodeWithArgs: string
  }>
  arbitraryChain: boolean
  libraries: Array<string>
  gitCommit: string | null
  // Previous versions of Sphinx did not include the option to transfer funds to the safe.
  // To keep this feature safely backwards compatible, this type is optional. This reflects
  // the fact that deployment configs from previous versions may not include this field.
  safeFundingRequest?: {
    fundsRequested: string
    startingBalance: string
  }
}

export type DeploymentInfo = {
  safeAddress: string
  moduleAddress: string
  requireSuccess: boolean
  executorAddress: string
  nonce: string
  chainId: string
  blockGasLimit: string
  blockNumber: string
  safeInitData: string
  newConfig: InternalSphinxConfig
  executionMode: ExecutionMode
  initialState: InitialChainState
  arbitraryChain: boolean
  sphinxLibraryVersion: string
  accountAccesses: Array<ParsedAccountAccess>
  gasEstimates: Array<string>
  fundsRequestedForSafe: string
  safeStartingBalance: string
}

export type InitialChainState = {
  isSafeDeployed: boolean
  isModuleDeployed: boolean
  isExecuting: boolean
}

export type UnsafeAllow = {
  delegatecall?: boolean
  selfdestruct?: boolean
  missingPublicUpgradeTo?: boolean
  emptyPush?: boolean
  flexibleConstructor?: boolean
  renames?: boolean
  skipStorageCheck?: boolean
}

export type UserAddressOverrides = {
  chains: Array<string>
  address: string
}

export type UserSphinxConfigWithAddresses = {
  projectName: string
  mainnets: Array<string>
  testnets: Array<string>
  safeAddress: string
  moduleAddress: string
}

export type InternalSphinxConfig = {
  projectName: string
  orgId: string
  owners: Array<string>
  mainnets: Array<string>
  testnets: Array<string>
  threshold: string
  saltNonce: string
}

export enum ActionInputType {
  CREATE,
  CREATE2,
  CALL,
}

export interface Create2ActionInput extends AbstractActionInput {
  create2Address: string
  initCodeWithArgs: string
  actionType: ActionInputType.CREATE2
}

export interface CreateActionInput extends AbstractActionInput {
  contractAddress: string
  initCodeWithArgs: string
  actionType: ActionInputType.CREATE
}

export type DecodedAction = {
  referenceName: string
  functionName: string
  variables: ParsedVariable
  address: string
  value?: string
}

export interface FunctionCallActionInput extends AbstractActionInput {
  actionType: ActionInputType.CALL
}

/**
 * @property contracts - The contracts deployed in this action that belong to a source file (i.e.
 * they each correspond to a fully qualified name). We need to know which contracts are deployed in
 * each action so that we can determine which transaction receipt corresponds to each contract
 * deployment when writing the contract deployment artifacts.
 */
interface AbstractActionInput extends SphinxTransaction {
  contracts: Array<ParsedContractDeployment>
  decodedAction: DecodedAction
  index: string
}

export interface BuildInfos {
  [id: string]: BuildInfo
}

/**
 * Config object with added compilation details. Must add compilation details to the config before
 * the config can be published or off-chain tooling won't be able to re-generate the deployment.
 */
export interface DeploymentConfig {
  networkConfigs: Array<NetworkConfig>
  merkleTree: SphinxMerkleTree
  configArtifacts: ConfigArtifacts
  buildInfos: BuildInfos
  inputs: Array<CompilerInput>
  version: string
}

export type ConfigArtifacts = {
  [fullyQualifiedName: string]: {
    buildInfoId: string
    artifact: ContractArtifact
  }
}

export type DeploymentRevert = {
  deploymentReverted: boolean
  revertString?: string
}

export type ImportCache = {
  requiresImport: boolean
  currProxyAdmin?: string
}

export type FoundryContractConfig = {
  referenceName: string
  addr: string
  kind: ContractKindEnum
  userSaltHash: string
}

export type GetConfigArtifacts = (
  initCodeWithArgsArray: Array<string>
) => Promise<{ configArtifacts: ConfigArtifacts; buildInfos: BuildInfos }>

export type GetProviderForChainId = (chainId: number) => SphinxJsonRpcProvider

/**
 * This is the format of the JSON file that is output in a Forge dry run. This type doesn't include
 * the "contractAddress" field that exists in the actual broadcast file because it can be `null` for
 * low-level calls, so we prefer to always use the 'transactions.to' field instead.
 *
 * @param contractName The name of the target contract. This is null if Foundry can't infer the
 * contract's name. If this is a string and the contract's name is unique in the repo, then it'll be
 * the contract's name. If the contract isn't unique in the repo, then it will either be the fully
 * qualified name or null, depending on whether or not Foundry can infer its name.
 * @param function The name of the function that the transaction is calling. For example,
 * "myFunction(uint256)".
 */
interface AbstractFoundryTransaction {
  transactionType: 'CREATE' | 'CALL' | 'CREATE2'
  contractName: string | null
  function: string | null
  arguments: Array<any> | null
  transaction: {
    type: string | null
    from: string | null
    gas: string | null
    input: string | null
    nonce: string | null
    accessList: string | null
    // Undefined if deployed a library.
    value?: string | null
    // Defined if `transactionType` is 'CALL'. Undefined if `transactionType` is 'CREATE'.
    to?: string | null
  }
  additionalContracts: Array<{
    transactionType: string
    address: string
    initCode: string
  }>
  isFixedGasLimit: boolean
}

export interface FoundryDryRunTransaction extends AbstractFoundryTransaction {
  hash: null
}

export interface FoundryBroadcastTransaction
  extends AbstractFoundryTransaction {
  hash: string
}
