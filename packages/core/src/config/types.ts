import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  IMMUTABLE_TYPE_HASH,
  IMPLEMENTATION_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
} from '@sphinx-labs/contracts'
import { BigNumber as EthersV5BigNumber } from '@ethersproject/bignumber'

import { BuildInfo, ContractArtifact } from '../languages/solidity/types'
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
  patch: '5',
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
 * Allowable types for Sphinx config variables defined by the user.
 */
export type UserConfigVariable =
  | boolean
  | string
  | number
  | EthersV5BigNumber
  | Array<UserConfigVariable>
  | {
      [name: string]: UserConfigVariable
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

export type ParsedConfig = {
  authAddress: string
  managerAddress: string
  chainId: string
  actionInputs: Array<
    ExtendedDeployContractActionInput | ExtendedFunctionCallActionInput
  >
  newConfig: SphinxConfig<SupportedNetworkName>
  isLiveNetwork: boolean
  initialState: InitialChainState
  remoteExecution: boolean
}

export type DeploymentInfo = {
  authAddress: string
  managerAddress: string
  chainId: bigint
  actionInputs: Array<RawSphinxActionInput>
  newConfig: SphinxConfig<bigint>
  isLiveNetwork: boolean
  initialState: InitialChainState
  remoteExecution: boolean
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

/**
 * User-defined contract definition in a Sphinx config.
 */
export type UserContractConfig = {
  contract: string
  address?: string
  kind: UserContractKind
  previousBuildInfo?: string
  previousFullyQualifiedName?: string
  variables?: UserConfigVariables
  constructorArgs?: UserConfigVariables
  overrides?: Array<UserConstructorArgOverride>
  salt?: UserSalt
  unsafeAllow?: UnsafeAllow
}

export type UserSalt = string | number

export type UserContractConfigs = {
  [referenceName: string]: UserContractConfig
}

export type UserConfigVariables = {
  [name: string]: UserConfigVariable
}

export type UserArgOverride =
  | UserConstructorArgOverride
  | UserFunctionArgOverride

export type UserConstructorArgOverride = {
  chains: Array<SupportedNetworkName>
  constructorArgs: {
    [name: string]: UserConfigVariable
  }
}

export type UserFunctionOptions = {
  overrides: Array<UserFunctionArgOverride>
}

export type UserFunctionArgOverride = {
  chains: Array<SupportedNetworkName>
  args: {
    [name: string]: UserConfigVariable
  }
}

export type UserAddressOverrides = {
  chains: Array<string>
  address: string
}

export interface DeployContractActionInput {
  fullyQualifiedName: string
  actionType: string
  skip: boolean
  initCode: string
  constructorArgs: string
  userSalt: string
  referenceName: string
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

export interface ExtendedDeployContractActionInput
  extends DeployContractActionInput {
  decodedAction: DecodedAction
  create3Address: string
}

export interface ExtendedFunctionCallActionInput
  extends FunctionCallActionInput {
  decodedAction: DecodedAction
}

export type DecodedAction = {
  referenceName: string
  functionName: string
  variables: ParsedVariable
}

export interface FunctionCallActionInput {
  fullyQualifiedName: string
  actionType: string
  skip: boolean
  to: string
  selector: string
  functionParams: string
  nonce: string
  referenceName: string
}

export type RawSphinxActionInput = {
  fullyQualifiedName: string
  actionType: bigint
  skip: boolean
  data: string
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
  fullyQualifiedNames: Array<string>
) => Promise<ConfigArtifacts>

export type GetProviderForChainId = (chainId: number) => SphinxJsonRpcProvider
