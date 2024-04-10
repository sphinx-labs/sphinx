import {
  DeploymentConfig,
  ConfigArtifacts,
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
  getNetworkGasEstimate,
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
  getNetworkGasEstimate: GetNetworkGasEstimate
  buildNetworkConfigArray: BuildNetworkConfigArray
  storeDeploymentConfig: StoreDeploymentConfig
  relayProposal: RelayProposal
  fetchRemoteArtifacts: FetchRemoteArtifacts
  assertNoLinkedLibraries: AssertNoLinkedLibraries
}

export const makeSphinxContext = (): SphinxContext => {
  return {
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
