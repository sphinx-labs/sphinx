import { makeSphinxMerkleTree, SphinxMerkleTree } from '@sphinx-labs/contracts'

import { HumanReadableAction, HumanReadableActions } from '../actions/types'
import { getConfigArtifactsRemote } from '../utils'
import { CompilerConfig, ConfigArtifacts } from './types'
import { makeDeploymentData } from '../tasks'
import { getReadableActions } from './utils'

/**
 * Fetches a deployment from a URI.
 *
 * @param uri URI to fetch.
 * @param ipfsUrl Optional IPFS URL to fetch the URI.
 */
export const buildDeploymentWithCompilerConfigs = async (
  compilerConfigs: Array<CompilerConfig>
): Promise<{
  merkleTree: SphinxMerkleTree
  compilerConfigs: Array<CompilerConfig>
  configArtifacts: ConfigArtifacts
  humanReadableActions: HumanReadableActions
}> => {
  const configArtifacts = await getConfigArtifactsRemote(compilerConfigs)

  const humanReadableActions: {
    [chainId: number]: Array<HumanReadableAction>
  } = {}

  for (const compilerConfig of compilerConfigs) {
    humanReadableActions[compilerConfig.chainId] = getReadableActions(
      compilerConfig.actionInputs
    )
  }

  const deploymentData = makeDeploymentData(compilerConfigs)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  return {
    merkleTree,
    compilerConfigs,
    configArtifacts,
    humanReadableActions,
  }
}
