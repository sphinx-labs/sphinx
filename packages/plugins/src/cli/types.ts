import ora from 'ora'
import { ethers } from 'ethers'
import {
  DeploymentConfig,
  ConfigArtifacts,
  GetConfigArtifacts,
  NetworkConfig,
  BuildInfos,
  NetworkGasEstimate,
} from '@sphinx-labs/core'

import { FoundryToml } from '../foundry/types'

export interface ProposeCommandArgs {
  scriptPath: string
  networks: Array<string>
  confirm: boolean
  dryRun: boolean
  silent: boolean
  targetContract?: string
  sig?: Array<string>
}

export interface DeployCommandArgs {
  network: string
  confirm: boolean
  silent: boolean
  scriptPath: string
  verify: boolean
  targetContract?: string
  sig?: Array<string>
}

export interface FetchArtifactsArgs {
  apiKey: string
  orgId: string
  projectName: string
  silent: boolean
}

export interface ArtifactsCommandArgs {
  orgId: string
  projectName: string
  silent: boolean
}

export type GetNetworkGasEstimate = (
  deploymentConfig: DeploymentConfig,
  chainId: string,
  rpcUrl: string
) => Promise<NetworkGasEstimate>

export type BuildNetworkConfigArray = (
  scriptPath: string,
  scriptFunctionCalldata: string,
  safeAddress: string,
  networks: Array<string>,
  sphinxPluginTypesInterface: ethers.Interface,
  foundryToml: FoundryToml,
  projectRoot: string,
  getConfigArtifacts: GetConfigArtifacts,
  targetContract?: string,
  spinner?: ora.Ora
) => Promise<{
  networkConfigArrayWithRpcUrls?: Array<{
    networkConfig: NetworkConfig
    rpcUrl: string
  }>
  configArtifacts?: ConfigArtifacts
  buildInfos?: BuildInfos
  isEmpty: boolean
}>

export type FetchRemoteArtifacts = (args: FetchArtifactsArgs) => void
