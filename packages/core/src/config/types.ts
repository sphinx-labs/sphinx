import { CompilerInput } from '../languages'

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
  proxy?: string
  variables?: UserConfigVariables
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
  variables: ParsedConfigVariables
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
  inputs: ChugSplashInputs
}

export type ChugSplashInputs = Array<ChugSplashInput>

export type ChugSplashInput = {
  solcVersion: string
  solcLongVersion: string
  input: CompilerInput
}
