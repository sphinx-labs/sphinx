import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_ADAPTER_ADDRESS,
  EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
} from '@chugsplash/contracts'
import { constants } from 'ethers'

import { CompilerInput } from '../languages/solidity/types'

export const externalProxyTypes = [
  'oz-transparent',
  'oz-uups',
  'external-default',
]
export type ExternalProxyType =
  | 'oz-transparent'
  | 'oz-uups'
  | 'external-default'
export const proxyTypeHashes: { [proxyType: string]: string } = {
  'internal-default': constants.HashZero,
  'external-default': EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
  'oz-transparent': OZ_TRANSPARENT_PROXY_TYPE_HASH,
  'oz-uups': OZ_UUPS_ADAPTER_ADDRESS,
}

export type ProxyType = ExternalProxyType | 'internal-default'

/**
 * Allowable types for ChugSplash config variables defined by the user.
 */
export type UserConfigVariable =
  | boolean
  | string
  | number
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
    projectName: string
    skipStorageCheck?: boolean
  }
  contracts: UserContractConfigs
}

/**
 * Full parsed config object.
 */
export interface ParsedChugSplashConfig {
  options: {
    projectName: string
    skipStorageCheck?: boolean
  }
  contracts: ParsedContractConfigs
}

/**
 * User-defined contract definition in a ChugSplash config.
 */
export type UserContractConfig = {
  contract: string
  externalProxy?: string
  externalProxyType?: ExternalProxyType
  previousBuildInfo?: string
  previousFullyQualifiedName?: string
  variables?: UserConfigVariables
  constructorArgs?: UserConfigVariables
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
  proxy: string
  proxyType: ProxyType
  variables: ParsedConfigVariables
  constructorArgs: ParsedConfigVariables
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
}
