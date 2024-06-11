import {
  DeploymentConfig,
  ConfigArtifacts,
  GetConfigArtifacts,
  NetworkConfig,
  ProposalRequest,
  RelayProposal,
  SphinxJsonRpcProvider,
  SphinxTransactionReceipt,
  StoreDeploymentConfig,
  getPreview,
  isLiveNetwork,
  relayProposal,
  storeDeploymentConfig,
  userConfirmation,
} from '@sphinx-labs/core'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { SphinxMerkleTree } from '@sphinx-labs/contracts'

import {
  assertNoLinkedLibraries,
  makeGetConfigArtifacts,
} from '../foundry/utils'
import { ProposeArgs, buildNetworkConfigArray, propose } from './propose'
import { DeployArgs, deploy } from './deploy'
import {
  AssertNoLinkedLibraries,
  BuildNetworkConfigArray,
  FetchRemoteArtifacts,
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
    deploymentConfigData?: string
    configArtifacts?: ConfigArtifacts
    networkConfigArray?: Array<NetworkConfig>
    merkleTree?: SphinxMerkleTree
  }>
  deploy: (args: DeployArgs) => Promise<{
    deploymentConfig?: DeploymentConfig
    merkleTree?: SphinxMerkleTree
    preview?: ReturnType<typeof getPreview>
    receipts?: Array<SphinxTransactionReceipt>
    configArtifacts?: ConfigArtifacts
  }>
  buildNetworkConfigArray: BuildNetworkConfigArray
  storeDeploymentConfig: StoreDeploymentConfig
  relayProposal: RelayProposal
  fetchRemoteArtifacts: FetchRemoteArtifacts
  assertNoLinkedLibraries: AssertNoLinkedLibraries
}

export const makeSphinxContext = (): SphinxContext => {
  return {
    makeGetConfigArtifacts,
    prompt: userConfirmation,
    isLiveNetwork,
    propose,
    deploy,
    buildNetworkConfigArray,
    storeDeploymentConfig,
    relayProposal,
    fetchRemoteArtifacts,
    assertNoLinkedLibraries,
  }
}
