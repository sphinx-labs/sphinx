import ora from 'ora'
import { ethers } from 'ethers'
import {
  DeploymentConfig,
  ConfigArtifacts,
  GetConfigArtifacts,
  NetworkConfig,
} from '@sphinx-labs/core'

import { FoundryToml } from '../foundry/types'

export interface ProposeCommandArgs {
  scriptPath: string
  networks: 'testnets' | 'mainnets'
  confirm: boolean
  dryRun: boolean
  silent: boolean
  targetContract?: string
}

export interface DeployCommandArgs {
  network: string
  confirm: boolean
  silent: boolean
  scriptPath: string
  verify: boolean
  targetContract?: string
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
  foundryToml: FoundryToml
) => Promise<{
  chainId: number
  estimatedGas: string
}>

export type BuildNetworkConfigArray = (
  scriptPath: string,
  isTestnet: boolean,
  sphinxPluginTypesInterface: ethers.Interface,
  foundryToml: FoundryToml,
  projectRoot: string,
  getConfigArtifacts: GetConfigArtifacts,
  targetContract?: string,
  spinner?: ora.Ora
) => Promise<{
  networkConfigArray?: Array<NetworkConfig>
  configArtifacts?: ConfigArtifacts
  isEmpty: boolean
}>

export type FetchRemoteArtifacts = (args: FetchArtifactsArgs) => void
