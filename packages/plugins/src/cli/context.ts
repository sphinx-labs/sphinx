import {
  GetConfigArtifacts,
  SphinxJsonRpcProvider,
  isLiveNetwork,
  userConfirmation,
} from '@sphinx-labs/core'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import { makeGetConfigArtifacts } from '../foundry/utils'

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
}

export const makeSphinxContext = (): SphinxContext => {
  return {
    makeGetConfigArtifacts,
    prompt: userConfirmation,
    isLiveNetwork,
  }
}
