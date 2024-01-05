import {
  CompilerConfig,
  ConfigArtifacts,
  GetConfigArtifacts,
  ParsedConfig,
  ProposalRequest,
  SphinxJsonRpcProvider,
  SphinxTransactionReceipt,
  getPreview,
  isLiveNetwork,
  userConfirmation,
} from '@sphinx-labs/core'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { SphinxMerkleTree } from '@sphinx-labs/contracts'

import { makeGetConfigArtifacts } from '../foundry/utils'
import { ProposeArgs, propose } from './propose'
import { DeployArgs, deploy } from './deploy'

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
}

export const makeSphinxContext = (): SphinxContext => {
  return {
    makeGetConfigArtifacts,
    prompt: userConfirmation,
    isLiveNetwork,
    propose,
    deploy,
  }
}
