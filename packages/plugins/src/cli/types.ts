import ora from 'ora'
import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  GetConfigArtifacts,
  NetworkConfig,
  BuildInfos,
} from '@sphinx-labs/core'

import { FoundryToml } from '../foundry/types'
import { SphinxContext } from './context'

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

export type BuildNetworkConfigArray = (
  scriptPath: string,
  scriptFunctionCalldata: string,
  safeAddress: string,
  networks: Array<string>,
  sphinxPluginTypesInterface: ethers.Interface,
  foundryToml: FoundryToml,
  projectRoot: string,
  getConfigArtifacts: GetConfigArtifacts,
  sphinxContext: SphinxContext,
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

export type AssertNoLinkedLibraries = (
  scriptPath: string,
  cachePath: string,
  artifactFolder: string,
  projectRoot: string,
  targetContract?: string
) => Promise<void>
