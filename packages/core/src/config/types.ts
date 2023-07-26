import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  IMMUTABLE_TYPE_HASH,
  IMPLEMENTATION_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
} from '@sphinx/contracts'
import { BigNumber, providers } from 'ethers'
import { CompilerInput } from 'hardhat/types'

import { BuildInfo, ContractArtifact } from '../languages/solidity/types'

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

/**
 * Allowable types for Sphinx config variables defined by the user.
 */
export type UserConfigVariable =
  | boolean
  | string
  | number
  | BigNumber
  | Array<UserConfigVariable>
  | {
      [name: string]: UserConfigVariable
    }

/**
 * Parsed Sphinx config variable.
 */
export type ParsedConfigVariable =
  | boolean
  | string
  | number
  | Array<ParsedConfigVariable>
  | {
      [name: string]: ParsedConfigVariable
    }

export type UserSphinxConfig = UserConfig | UserConfigWithOptions

export type UserConfig = {
  projectName: string
  contracts: UserContractConfigs
  options?: never
}

export type UserConfigWithOptions = {
  projectName: string
  contracts: UserContractConfigs
  options: UserConfigOptions
}

/**
 * @notice The `mainnets` field is an array of network names, e.g. ['ethereum', 'optimism'].
 * The `testnets` field is an array of network names, e.g. ['goerli', 'optimism-goerli'].
 */
export interface UserConfigOptions extends ConfigOptions {
  mainnets: Array<string>
  testnets: Array<string>
}

/**
 * @notice The `chainIds` field is an array of chain IDs that correspond to either the `mainnets`
 * field or the `testnets` field in the user config. Whether we use `mainnets` or `testnets` is
 * determined by the value of the boolean variable `isTestnet`, which is passed into the
 * `getParsedConfigWithOptions` function. If `isTestnet` is true, then we use `testnets`, otherwise we use
 * `mainnets`.
 */
export interface ParsedConfigOptions extends ConfigOptions {
  chainIds: Array<number>
}

export interface ConfigOptions {
  orgId: string
  owners: Array<string>
  threshold: number
  proposers: Array<string>
}

export interface ParsedConfig {
  projectName: string
  manager: string
  contracts: ParsedContractConfigs
}

export interface ParsedOwnerConfig extends ParsedConfig {
  owner: string
  options?: never
}

export interface ParsedConfigWithOptions extends ParsedConfig {
  options: ParsedConfigOptions
  owner?: never
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

/**
 * Contract definition in a parsed config. Note that the `contract` field is the
 * contract's fully qualified name, unlike in `UserContractConfig`, where it can be the fully
 * qualified name or the contract name.
 */
export type ParsedContractConfig = {
  contract: string
  address: string
  kind: ContractKind
  variables: ParsedConfigVariables
  constructorArgs: ParsedConfigVariables
  isUserDefinedAddress: boolean
  unsafeAllow: UnsafeAllow
  salt: string
  previousBuildInfo?: string
  previousFullyQualifiedName?: string
}

export type ParsedContractConfigs = {
  [referenceName: string]: ParsedContractConfig
}

export type ParsedConfigVariables = {
  [name: string]: ParsedConfigVariable
}

/**
 * Config object with added compilation details. Must add compilation details to the config before
 * the config can be published or off-chain tooling won't be able to re-generate the deployment.
 */
export interface CompilerConfig extends ParsedConfig {
  inputs: Array<SphinxInput>
}

export type SphinxInput = {
  solcVersion: string
  solcLongVersion: string
  input: CompilerInput
  id: string
}

export type ConfigArtifacts = {
  [referenceName: string]: {
    buildInfo: BuildInfo
    artifact: ContractArtifact
  }
}

export type ConfigCache = {
  isManagerDeployed: boolean
  blockGasLimit: BigNumber
  localNetwork: boolean
  networkName: string
  contractConfigCache: ContractConfigCache
}

export type ContractConfigCache = {
  [referenceName: string]: {
    isTargetDeployed: boolean
    deploymentRevert: DeploymentRevert
    importCache: ImportCache
    deployedCreationCodeWithArgsHash?: string
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

export type MinimalConfig = {
  manager: string
  owner: string
  projectName: string
  contracts: Array<MinimalContractConfig>
}

export type MinimalContractConfig = {
  referenceName: string
  addr: string
  kind: ContractKindEnum
  userSaltHash: string
}

export type GetConfigArtifacts = (
  contractConfigs: UserContractConfigs
) => Promise<ConfigArtifacts>

export type GetProviderForChainId = (
  chainId: number
) => providers.JsonRpcProvider

export type GetCanonicalConfig = (
  orgId: string,
  isTestnet: boolean,
  apiKey: string,
  projectName: string
) => Promise<CanonicalConfig | undefined>

export interface CanonicalConfig {
  manager: string
  projectName: string
  options: ConfigOptions
  contracts: ParsedContractConfigs
  chainStates: {
    [chainId: number]: {
      firstProposalOccurred: boolean
      projectCreated: boolean
    }
  }
}
