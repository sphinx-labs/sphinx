import { FoundryContractArtifact, Operation } from '@sphinx-labs/contracts'

import { BuildInfo, CompilerOutput } from '../languages/solidity/types'
import { SphinxJsonRpcProvider } from '../provider'
import { SupportedNetworkName } from '../networks'

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
  safeAddress: string
  moduleAddress: string
  executorAddress: string
  safeInitData: string
  nonce: string
  chainId: string
  actions: Array<Action>
  newConfig: SphinxConfig<SupportedNetworkName>
  isLiveNetwork: boolean
  initialState: InitialChainState
  unlabeledAddresses: string[]
  arbitraryChain: boolean
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
  newConfig: SphinxConfig<SupportedNetworkName>
  isLiveNetwork: boolean
  initialState: InitialChainState
  labels: Array<Label>
  arbitraryChain: boolean
}

export type InitialChainState = {
  isSafeDeployed: boolean
  isModuleDeployed: boolean
  isExecuting: boolean
}

export type Label = {
  addr: string
  fullyQualifiedName: string
}

export type SphinxConfig<N = bigint | SupportedNetworkName> = {
  projectName: string
  orgId: string
  owners: Array<string>
  mainnets: Array<N>
  testnets: Array<N>
  threshold: string
  saltNonce: string
}

export type FullyQualifiedName = `${string}:${string}`

// TODO(docs): `name`
export interface RawAction {
  to: string
  value: string
  txData: string
  operation: Operation
  requireSuccess: boolean
  transactionType: FoundryTransactionType
  name: FullyQualifiedName | string | null
  additionalContracts: FoundryDryRunTransaction['additionalContracts']
  functionName: string
  variables: ParsedVariable
}

export interface Action extends RawAction {
  variables: ParsedVariable
  index: string
  gas: string
  additionalContracts: Array<ParsedAdditionalContract>
  address: string
}

export interface ParsedAdditionalContract extends FoundryAdditionalContract {
  fullyQualifiedName?: FullyQualifiedName
}

export interface Create2Action extends Action {}

export interface CallAction extends Action {}

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
    artifact: FoundryContractArtifact
  }
}

export type BuildInfoRemote = BuildInfo & {
  output: CompilerOutput
}

export type ConfigArtifactsRemote = {
  [fullyQualifiedName: string]: {
    buildInfo: BuildInfoRemote
    artifact: FoundryContractArtifact
  }
}

export type GetConfigArtifacts = (
  fullyQualifiedNames: Array<string>,
  contractNames: Array<string>
) => Promise<ConfigArtifacts>

export type GetProviderForChainId = (chainId: number) => SphinxJsonRpcProvider

export type FoundryTransactionType = 'CREATE' | 'CALL' | 'CREATE2'

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
  transactionType: FoundryTransactionType
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
    // TODO(docs): mv: Null if the transaction deploys a library.
    value?: string | null
    // TODO(docs): mv: Null if `transactionType` is 'CREATE'. Defined otherwise.
    to?: string | null
  }
  additionalContracts: Array<FoundryAdditionalContract>
  isFixedGasLimit: boolean
}

export interface FoundryAdditionalContract {
  transactionType: string // TODO: can we make this any more specific? i.e. `create`, create2, or the `transactionType` defined above?
  address: string
  initCode: string
}

export interface FoundryDryRunTransaction extends AbstractFoundryTransaction {
  hash: null
}

export interface FoundryBroadcastTransaction
  extends AbstractFoundryTransaction {
  hash: string
}
