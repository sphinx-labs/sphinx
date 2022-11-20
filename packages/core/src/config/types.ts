import { CompilerInput } from '../languages'

/**
 * Allowable types for variables.
 */
export type ConfigVariable =
  | boolean
  | string
  | number
  | Array<ConfigVariable>
  | ContractReference
  | {
      [name: string]: ConfigVariable
    }

export type ContractReference = {
  '!Ref': string
}

/**
 * Full config object that can be used to commit a deployment.
 */
export interface ChugSplashConfig {
  options: {
    projectName: string
    projectOwner: string
  }
  contracts: {
    [referenceName: string]: ContractConfig
  }
}

export type ContractConfig = {
  contract: string
  address?: string
  variables?: {
    [name: string]: ConfigVariable
  }
}

/**
 * Config object with added compilation details. Must add compilation details to the config before
 * the config can be published or off-chain tooling won't be able to re-generate the deployment.
 */
export interface CanonicalChugSplashConfig extends ChugSplashConfig {
  inputs: ChugSplashInputs
}

export type ChugSplashInputs = Array<ChugSplashInput>

export type ChugSplashInput = {
  solcVersion: string
  solcLongVersion: string
  input: CompilerInput
}
