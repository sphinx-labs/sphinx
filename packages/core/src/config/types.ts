import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  NO_PROXY_TYPE_HASH,
} from '@chugsplash/contracts'
import { BigNumber, constants } from 'ethers'
import { CompilerInput } from 'hardhat/types'

import { BuildInfo, ContractArtifact } from '../languages/solidity/types'

export const externalContractKinds = [
  'oz-transparent',
  'oz-ownable-uups',
  'oz-access-control-uups',
  'external-default',
  'no-proxy',
]
export type ExternalContractKind =
  | 'oz-transparent'
  | 'oz-ownable-uups'
  | 'oz-access-control-uups'
  | 'external-default'
  | 'no-proxy'

export const contractKindHashes: { [contractKind: string]: string } = {
  'internal-default': constants.HashZero,
  'external-default': EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
  'oz-transparent': OZ_TRANSPARENT_PROXY_TYPE_HASH,
  'oz-ownable-uups': OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  'oz-access-control-uups': OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  'no-proxy': NO_PROXY_TYPE_HASH,
}

export type ContractKind = ExternalContractKind | 'internal-default'

/**
 * Allowable types for ChugSplash config variables defined by the user.
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
 * Parsed ChugSplash config variable.
 */
export type ParsedConfigVariable =
  | boolean
  | string
  | number
  | Array<ParsedConfigVariable>
  | {
      [name: string]: ParsedConfigVariable
    }

/**
 * Full user-defined config object that can be used to commit a deployment/upgrade.
 */
export interface UserChugSplashConfig {
  options: {
    organizationID: string
    projectName: string
  }
  contracts: UserContractConfigs
}

/**
 * Full parsed config object.
 */
export interface ParsedChugSplashConfig {
  options: {
    organizationID: string
    projectName: string
  }
  contracts: ParsedContractConfigs
}

/**
 * User-defined contract definition in a ChugSplash config.
 */
export type UserContractConfig = {
  contract: string
  externalProxy?: string
  kind?: ExternalContractKind
  previousBuildInfo?: string
  previousFullyQualifiedName?: string
  variables?: UserConfigVariables
  constructorArgs?: UserConfigVariables
  salt?: string
  unsafeAllowEmptyPush?: boolean
  unsafeAllowRenames?: boolean
  unsafeSkipStorageCheck?: boolean
  unsafeAllowFlexibleConstructor?: boolean
  unsafeAllow?: {
    delegatecall?: boolean
    selfdestruct?: boolean
    missingPublicUpgradeTo?: boolean
  }
}

export type UserContractConfigs = {
  [referenceName: string]: UserContractConfig
}

export type UserConfigVariables = {
  [name: string]: UserConfigVariable
}

/**
 * Contract definition in a `ParsedChugSplashConfig`. Note that the `contract` field is the
 * contract's fully qualified name, unlike in `UserContractConfig`, where it can be the fully
 * qualified name or the contract name.
 */
export type ParsedContractConfig = {
  contract: string
  address: string
  kind: ContractKind
  variables: ParsedConfigVariables
  salt: string
  constructorArgs: ParsedConfigVariables
  unsafeAllowEmptyPush?: boolean
  unsafeAllowFlexibleConstructor?: boolean
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
export interface CanonicalChugSplashConfig extends ParsedChugSplashConfig {
  inputs: Array<ChugSplashInput>
}

export type ChugSplashInput = {
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
