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
  InProcessEthersProvider,
} from '@sphinx-labs/core'
import { SphinxMerkleTree } from '@sphinx-labs/contracts'

import {
  assertNoLinkedLibraries,
  getNetworkGasEstimate,
  makeGetConfigArtifacts,
} from '../foundry/utils'
import { ProposeArgs, buildNetworkConfigArray, propose } from './propose'
import { DeployArgs, deploy } from './deploy'
import {
  AssertNoLinkedLibraries,
  BuildNetworkConfigArray,
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
    provider: SphinxJsonRpcProvider | InProcessEthersProvider
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
  getNetworkGasEstimate: GetNetworkGasEstimate
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
    getNetworkGasEstimate,
    buildNetworkConfigArray,
    storeDeploymentConfig,
    relayProposal,
    fetchRemoteArtifacts,
    assertNoLinkedLibraries,
  }
}
