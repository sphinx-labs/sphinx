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

export type RawActionInput = RawFunctionCallActionInput | RawCreate2ActionInput

export type ActionInput = FunctionCallActionInput | Create2ActionInput

export type ParsedConfig = {
  safeAddress: string
  moduleAddress: string
  executorAddress: string
  safeInitData: string
  nonce: string
  chainId: string
  blockGasLimit: string
  actionInputs: Array<ActionInput>
  newConfig: SphinxConfig
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
}

export type DeploymentInfo = {
  safeAddress: string
  moduleAddress: string
  requireSuccess: boolean
  executorAddress: string
  nonce: string
  chainId: string
  blockGasLimit: string
  safeInitData: string
  newConfig: SphinxConfig
  executionMode: ExecutionMode
  initialState: InitialChainState
  arbitraryChain: boolean
  sphinxLibraryVersion: string
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

export type SphinxConfigWithAddresses = SphinxConfig & {
  safeAddress: string
  moduleAddress: string
}

export type SphinxConfig = {
  projectName: string
  orgId: string
  owners: Array<string>
  mainnets: Array<string>
  testnets: Array<string>
  threshold: string
  saltNonce: string
}

export interface RawCreate2ActionInput extends SphinxTransaction {
  create2Address: string
  initCodeWithArgs: string
  actionType: string
  additionalContracts: FoundryDryRunTransaction['additionalContracts']
}

export interface Create2ActionInput extends RawCreate2ActionInput {
  contracts: Array<ParsedContractDeployment>
  decodedAction: DecodedAction
  index: string
}

export type DecodedAction = {
  referenceName: string
  functionName: string
  variables: ParsedVariable
  address: string
}

export interface RawFunctionCallActionInput extends SphinxTransaction {
  actionType: string
  additionalContracts: Array<{
    transactionType: string
    address: string
    initCode: string
  }>
}

export interface FunctionCallActionInput extends RawFunctionCallActionInput {
  contracts: Array<ParsedContractDeployment>
  decodedAction: DecodedAction
  index: string
}

/**
 * Config object with added compilation details. Must add compilation details to the config before
 * the config can be published or off-chain tooling won't be able to re-generate the deployment.
 */
export interface CompilerConfig extends ParsedConfig {
  inputs: Array<CompilerInput>
}

export type ConfigArtifacts = {
  [fullyQualifiedName: string]: {
    buildInfo: BuildInfo
    artifact: ContractArtifact
  }
}

export type ConfigArtifactsRemote = {
  [fullyQualifiedName: string]: {
    buildInfo: BuildInfo
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
) => Promise<ConfigArtifacts>

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
    data: string | null
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
