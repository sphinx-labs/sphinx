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
import { CompilerInput } from 'hardhat/types'

import { BuildInfo, ContractArtifact } from '../languages/solidity/types'
import { SphinxJsonRpcProvider } from '../provider'
import {
  SupportedChainId,
  SupportedMainnetNetworkName,
  SupportedNetworkName,
} from '../networks'
import { SemverVersion } from '../types'
import { SphinxActionType } from '../actions/types'

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

// export type ValidManagerVersion = 'v0.2.5' // TODO: put something like this in solidity for parsing
export const VALID_TEST_MANAGER_VERSIONS = ['v9.9.9']
export const VALID_MANAGER_VERSION: SemverVersion = {
  major: 0n,
  minor: 2n,
  patch: 5n,
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
export type ParsedConfigVariable =
  | boolean
  | string
  | number
  | bigint
  | Array<ParsedConfigVariable>
  | {
      [name: string]: ParsedConfigVariable
    }

export type UserSphinxConfig = UserConfig | UserConfigWithOptions

export type UserConfig = {
  projectName: string
  contracts: UserContractConfigs
  postDeploy?: Array<UserCallAction>
  options?: never
}

export type UserConfigWithOptions = {
  projectName: string
  contracts: UserContractConfigs
  options: UserConfigOptions
  postDeploy?: Array<UserCallAction>
}

export type UserCallAction = {
  functionName: string
  functionArgs: Array<UserConfigVariable>
  address: string
  abi?: Array<any>
  addressOverrides?: Array<UserAddressOverrides>
  functionArgOverrides?: Array<UserFunctionArgOverride>
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

// TODO: merge this with the CanonicalConfig b/c it's very similar to the actual ConfigOptions which is confusing
export interface ConfigOptions {
  orgId: string
  owners: Array<string>
  ownerThreshold: number
  proposers: Array<string>
  managerVersion: string
}

export type ParsedConfig = {
  authAddress: string
  managerAddress: string
  chainId: bigint
  actionInputs: Array<
    ExtendedDeployContractActionInput | ExtendedFunctionCallActionInput
  >
  newConfig: SphinxConfig
  isLiveNetwork: boolean
  initialState: InitialChainState
  remoteExecution: boolean
}

export type DeploymentInfo = {
  authAddress: string
  managerAddress: string
  chainId: bigint
  actionInputs: Array<RawSphinxActionInput>
  newConfig: SphinxConfig
  isLiveNetwork: boolean
  initialState: InitialChainState
  remoteExecution: boolean
}

export type InitialChainState = {
  proposers: Array<string>
  version: SemverVersion
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

// TODO(docs): 'kind' and 'variables' are kept for backwards compatibility with the old config
// TODO(docs): initCode does not have the constructor args
// export type DeployTODOContractTODO = {
//   initCode: string
//   encodedConstructorArgs: string
//   userSalt: string
//   referenceName: string
//   fullyQualifiedName: string
//   skip: boolean
//   address: string
//   kind: ContractKind
//   variables: ParsedConfigVariables
//   constructorArgs: ParsedConfigVariables
// }

export interface DeployContractActionInput {
  fullyQualifiedName: string
  actionType: typeof SphinxActionType.DEPLOY_CONTRACT
  skip: boolean
  initCode: string
  constructorArgs: string
  userSalt: string
  referenceName: string
}

export type SphinxConfig = {
  projectName: string
  orgId: string
  owners: Array<string>
  proposers: Array<string>
  mainnets: Array<SupportedMainnetNetworkName>
  testnets: Array<SupportedNetworkName>
  threshold: bigint
  version: SemverVersion
}

export interface ExtendedDeployContractActionInput
  extends DeployContractActionInput {
  decodedAction: DecodedAction
  create3Address: string
}

export interface ExtendedFunctionCallActionInput extends FunctionCallTODO {
  decodedAction: DecodedAction
}

export type DecodedAction = {
  referenceName: string
  functionName: string
  variables: ParsedConfigVariables
}

export interface FunctionCallTODO {
  fullyQualifiedName: string
  actionType: bigint
  skip: boolean
  to: string
  selector: string
  functionParams: string
  nonce: bigint
  referenceName: string
}

export type RawSphinxActionInput = {
  fullyQualifiedName: string
  actionType: bigint
  skip: boolean
  data: string
}

export type ParsedFunctionArgsPerChain = {
  [key in SupportedChainId]?: ParsedConfigVariables
}

export type ParsedConfigVariables = {
  [name: string]: ParsedConfigVariable
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
  currentManagerVersion: SemverVersion
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
  actions: Array<RawSphinxActionInput>
) => Promise<ConfigArtifacts>

export type GetProviderForChainId = (chainId: number) => SphinxJsonRpcProvider

export type GetCanonicalConfig = (
  orgId: string,
  isTestnet: boolean,
  apiKey: string,
  projectName: string
) => Promise<CanonicalConfig | undefined>

// TODO: i think with our new proposal logic, we remove any chainIds in the chainStates object that
// aren't in the current deployment. this may mean that we overwrite testnets when we're deploying
// on mainnets and vice versa.

export interface CanonicalConfig {
  manager: string
  projectName: string
  options: ConfigOptions
  chainStates: {
    [chainId: number]:
      | {
          firstProposalOccurred: boolean
          projectCreated: boolean
        }
      | undefined
  }
}
