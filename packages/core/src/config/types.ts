import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  IMMUTABLE_TYPE_HASH,
  IMPLEMENTATION_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
} from '@sphinx-labs/contracts'

import {
  BuildInfo,
  CompilerOutput,
  ContractArtifact,
} from '../languages/solidity/types'
import { SphinxJsonRpcProvider } from '../provider'
import { SupportedChainId, SupportedNetworkName } from '../networks'
import { SemVer } from '../types'

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

export const VALID_TEST_MANAGER_VERSIONS = ['v9.9.9']
export const VALID_MANAGER_VERSION: SemVer = {
  major: '0',
  minor: '2',
  patch: '6',
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

/**
 * Parsed Sphinx config variable.
 */
export type ParsedVariable =
  | boolean
  | string
  | number
  | bigint
  | Array<ParsedVariable>
  | {
      [name: string]: ParsedVariable
    }

export type RawActionInput =
  | RawDeployContractActionInput // TODO(docs): anywhere you mention "DeployContractAction", say CREATE3
  | RawFunctionCallActionInput
  | RawCreateActionInput
  | RawCreate2ActionInput

export type ActionInput =
  | DeployContractActionInput
  | DecodedFunctionCallActionInput
  | RawFunctionCallActionInput
  | DecodedCreate2ActionInput
  | RawCreate2ActionInput
  | DecodedCreateActionInput
  | RawCreateActionInput

export type ParsedConfig = {
  verify: {
    [address: string]: {
      fullyQualifiedName: string
      initCodeWithArgs: string
    }
  }
  authAddress: string
  managerAddress: string
  chainId: string
  actionInputs: Array<ActionInput>
  newConfig: SphinxConfig<SupportedNetworkName>
  isLiveNetwork: boolean
  initialState: InitialChainState
  remoteExecution: boolean
}

export type DeploymentInfo = {
  authAddress: string
  managerAddress: string
  chainId: string
  newConfig: SphinxConfig<SupportedNetworkName>
  isLiveNetwork: boolean
  initialState: InitialChainState
}

export type InitialChainState = {
  proposers: Array<string>
  version: SemVer
  isManagerDeployed: boolean
  firstProposalOccurred: boolean
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

export type SphinxConfig<N = bigint | SupportedNetworkName> = {
  projectName: string
  orgId: string
  owners: Array<string>
  proposers: Array<string>
  mainnets: Array<N>
  testnets: Array<N>
  threshold: string
  version: SemVer
}

export interface RawDeployContractActionInput {
  fullyQualifiedName: string
  actionType: string
  skip: boolean
  initCode: string
  constructorArgs: string
  userSalt: string
  referenceName: string
}

export interface DeployContractActionInput
  extends RawDeployContractActionInput {
  decodedAction: DecodedAction
  create3Address: string
}

export interface DecodedCreate2ActionInput {
  fullyQualifiedName: string
  decodedAction: DecodedAction
  to: string
  create2Address: string
  skip: boolean
  data: string
  actionType: string
  gas: bigint
}

export interface RawCreate2ActionInput {
  contractName: string | null
  create2Address: string
  to: string
  skip: boolean
  data: string
  actionType: string
  gas: bigint
}

export interface RawCreateActionInput {
  contractName: string | null
  actionType: string
  skip: boolean
  data: string
  gas: bigint
}

export interface DecodedCreateActionInput {
  fullyQualifiedName: string
  actionType: string
  skip: boolean
  data: string
  gas: bigint
  decodedAction: DecodedAction
  addr: string
}

// TODO: we don't assume that reference names are unique anymore. is that okay?

export type DecodedAction = {
  referenceName: string
  functionName: string
  variables: ParsedVariable
}

export type RawFunctionCallActionInput = {
  actionType: string
  skip: boolean
  to: string
  data: string
  contractName: string | null
  additionalContracts: Array<{
    transactionType: string
    address: string
    initCode: string
  }>
}

export type DecodedFunctionCallActionInput = {
  actionType: string
  skip: boolean
  to: string
  fullyQualifiedName: string
  data: string
  referenceName: string
  decodedAction: DecodedAction
}

/**
 * Config object with added compilation details. Must add compilation details to the config before
 * the config can be published or off-chain tooling won't be able to re-generate the deployment.
 */
export interface CompilerConfig extends ParsedConfig {
  inputs: Array<BuildInfoInputs>
}

/**
 * @notice The `BuildInfo` object, but without the compiler ouputs.
 */
export type BuildInfoInputs = Omit<BuildInfo, 'output'>

export type ConfigArtifacts = {
  [fullyQualifiedName: string]: {
    buildInfo: BuildInfo
    artifact: ContractArtifact
  }
}

export type BuildInfoRemote = BuildInfo & {
  output: CompilerOutput
}

export type ConfigArtifactsRemote = {
  [fullyQualifiedName: string]: {
    buildInfo: BuildInfoRemote
    artifact: ContractArtifact
  }
}

export type ConfigCache = {
  manager: string
  isManagerDeployed: boolean
  isExecuting: boolean
  currentManagerVersion: SemVer
  chainId: SupportedChainId
  isLiveNetwork: boolean
}

export type ContractConfigCache = {
  [referenceName: string]: {
    isTargetDeployed: boolean
    deploymentRevert: DeploymentRevert
    importCache: ImportCache
    previousConfigUri?: string
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
  fullyQualifiedNames: Array<string>,
  contractNames: Array<string>
) => Promise<ConfigArtifacts>

export type GetProviderForChainId = (chainId: number) => SphinxJsonRpcProvider
