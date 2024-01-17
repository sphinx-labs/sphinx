import {
  CompilerConfig,
  ConfigArtifacts,
  GetConfigArtifacts,
  ParsedConfig,
  ProposalRequest,
  RelayProposal,
  SphinxJsonRpcProvider,
  SphinxTransactionReceipt,
  StoreCanonicalConfig,
  getPreview,
  isLiveNetwork,
  relayProposal,
  storeCanonicalConfig,
  userConfirmation,
} from '@sphinx-labs/core'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { SphinxMerkleTree } from '@sphinx-labs/contracts'

import { getNetworkGasEstimate, makeGetConfigArtifacts } from '../foundry/utils'
import { ProposeArgs, buildParsedConfigArray, propose } from './propose'
import { DeployArgs, deploy } from './deploy'
import {
  BuildParsedConfigArray,
  FetchRemoteArtifacts,
  GetNetworkGasEstimate,
} from './types'
import { fetchRemoteArtifacts } from './artifacts'

export type SphinxContext = {
  makeGetConfigArtifacts: (
    artifactFolder: string,
    buildInfoFolder: string,
    projectRoot: string,
    cachePath: string
  ) => GetConfigArtifacts
  prompt: (question: string) => Promise<void>
  isLiveNetwork: (
    provider: SphinxJsonRpcProvider | HardhatEthersProvider
  ) => Promise<boolean>
  propose: (args: ProposeArgs) => Promise<{
    proposalRequest?: ProposalRequest
    canonicalConfigData?: string
    configArtifacts?: ConfigArtifacts
    parsedConfigArray?: Array<ParsedConfig>
    merkleTree?: SphinxMerkleTree
  }>
  deploy: (args: DeployArgs) => Promise<{
    compilerConfig?: CompilerConfig
    merkleTree?: SphinxMerkleTree
    preview?: ReturnType<typeof getPreview>
    receipts?: Array<SphinxTransactionReceipt>
    configArtifacts?: ConfigArtifacts
  }>
  getNetworkGasEstimate: GetNetworkGasEstimate
  buildParsedConfigArray: BuildParsedConfigArray
  storeCanonicalConfig: StoreCanonicalConfig
  relayProposal: RelayProposal
  fetchRemoteArtifacts: FetchRemoteArtifacts
}

export const makeSphinxContext = (): SphinxContext => {
  return {
    makeGetConfigArtifacts,
    prompt: userConfirmation,
    isLiveNetwork,
    propose,
    deploy,
    getNetworkGasEstimate,
    buildParsedConfigArray,
    storeCanonicalConfig,
    relayProposal,
    fetchRemoteArtifacts,
  }
}
