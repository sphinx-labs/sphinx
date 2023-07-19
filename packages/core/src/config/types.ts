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

export interface UserSphinxConfig {
  options?: UserOrgConfigOptions
  projects: UserProjectConfigs
}

export type ProjectConfigOptions = {
  projectOwners: Array<string>
  projectThreshold: number
}

/**
 * Full user-defined config object that can be used to commit a deployment/upgrade.
 */
export interface UserProjectConfig {
  options?: ProjectConfigOptions
  contracts: UserContractConfigs
}

export type UserProjectConfigs = {
  [projectName: string]: UserProjectConfig
}

/**
 * @notice The `mainnets` field is an array of network names, e.g. ['mainnet', 'optimism'].
 */
export interface UserOrgConfigOptions extends OrgConfigOptions {
  mainnets: Array<string>
  testnets: Array<string>
}

/**
 * @notice The `chainIds` field is an array of chain IDs that correspond to either the `mainnets`
 * field or the `testnets` field in the user config. Whether we use `mainnets` or `testnets` is
 * determined by the value of the boolean variable `isTestnet`, which is passed into the
 * `getParsedOrgConfig` function. If `isTestnet` is true, then we use `testnets`, otherwise we use
 * `mainnets`.
 */
export interface ParsedOrgConfigOptions extends OrgConfigOptions {
  chainIds: Array<number>
}

/**
 * @notice If any new fields are added to this interface, they must also be set in
 * `OwnerConfigOptions` as 'never'. For example: `newField?: never`. This is to ensure that
 * both of these interfaces are mutually exclusive.
 */
export interface OrgConfigOptions {
  orgId: string
  orgOwners: Array<string>
  orgThreshold: number
  proposers: Array<string>
  managers: Array<string>
  owner?: never
}

/**
 * @notice If any new fields are added to this interface, they must also be set in
 * `OrgConfigOptions` as 'never'. For example: `newField?: never`. This is to ensure that
 * both of these interfaces are mutually exclusive.
 */
export type OwnerConfigOptions = {
  owner: string
  orgId?: never
  orgThreshold?: never
  orgOwners?: never
  proposers?: never
  managers?: never
  networks?: never
}

export interface ParsedOwnerConfig {
  options: OwnerConfigOptions
  projects: ParsedProjectConfigs
}

export interface ParsedOrgConfig {
  options: ParsedOrgConfigOptions
  projects: ParsedProjectConfigs
}

export interface ParsedProjectConfigOptions {
  deployer: string
  project: string
  projectOwners?: Array<string>
  projectThreshold?: number
}

/**
 * Full parsed config object.
 */
export interface ParsedProjectConfig {
  options: ParsedProjectConfigOptions
  contracts: ParsedContractConfigs
}

export type ParsedProjectConfigs = {
  [projectName: string]: ParsedProjectConfig
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
export interface CanonicalProjectConfig extends ParsedProjectConfig {
  inputs: Array<SphinxInput>
}

export type SphinxInput = {
  solcVersion: string
  solcLongVersion: string
  input: CompilerInput
  id: string
}

export type ConfigArtifacts = {
  [projectName: string]: ProjectConfigArtifacts
}

export type ProjectConfigArtifacts = {
  [referenceName: string]: {
    buildInfo: BuildInfo
    artifact: ContractArtifact
  }
}

export type ConfigCache = {
  [projectName: string]: ProjectConfigCache
}

export type ProjectConfigCache = {
  isRegistered: boolean
  blockGasLimit: BigNumber
  localNetwork: boolean
  networkName: string
  contractConfigCache: ContractConfigCache
}

export type ContractConfigCache = {
  [referenceName: string]: {
    existingProjectName: string
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
  deployer: string
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
) => Promise<ProjectConfigArtifacts>

export type GetProviderForChainId = (
  chainId: number
) => providers.JsonRpcProvider

export interface CanonicalOrgConfig {
  deployer: string
  options: {
    orgId: string
    orgOwners: Array<string>
    orgThreshold: number
    proposers: Array<string>
    managers: Array<string>
  }
  projects: ParsedProjectConfigs
  chainStates: {
    [chainId: number]: {
      firstProposalOccurred: boolean
      projects: {
        [projectName: string]: {
          projectCreated: boolean
        }
      }
    }
  }
}
