import { makeSphinxMerkleTree, SphinxMerkleTree } from '@sphinx-labs/contracts'

import { getConfigArtifactsRemote } from '../utils'
import { CompilerConfig, ConfigArtifacts } from './types'
import { makeDeploymentData } from '../tasks'

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
}> => {
  const configArtifacts = await getConfigArtifactsRemote(compilerConfigs)
  const deploymentData = makeDeploymentData(compilerConfigs)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  return {
    merkleTree,
    compilerConfigs,
    configArtifacts,
  }
}
