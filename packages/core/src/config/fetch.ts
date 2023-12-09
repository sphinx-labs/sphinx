import { create, IPFSHTTPClient } from 'ipfs-http-client'
import { makeSphinxMerkleTree, SphinxMerkleTree } from '@sphinx-labs/contracts'

import { HumanReadableAction, HumanReadableActions } from '../actions/types'
import { callWithTimeout, getConfigArtifactsRemote } from '../utils'
import { CompilerConfig, ConfigArtifacts } from './types'
import { makeDeploymentData, getParsedConfigWithCompilerInputs } from '../tasks'
import { getReadableActions } from './utils'

export const sphinxFetchSubtask = async (args: {
  configUri: string
  ipfsUrl?: string
}): Promise<Array<CompilerConfig>> => {
  let config: Array<CompilerConfig>
  let ipfs: IPFSHTTPClient
  if (args.ipfsUrl) {
    ipfs = create({
      url: args.ipfsUrl,
    })
  } else if (process.env.IPFS_PROJECT_ID && process.env.IPFS_API_KEY_SECRET) {
    const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
    ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: {
        authorization: `Basic ${Buffer.from(projectCredentials).toString(
          'base64'
        )}`,
      },
    })
  } else {
    throw new Error(
      'You must either set your IPFS credentials in an environment file or call this task with an IPFS url.'
    )
  }

  if (args.configUri.startsWith('ipfs://')) {
    const decoder = new TextDecoder()
    let data = ''
    const stream = await ipfs.cat(args.configUri.replace('ipfs://', ''))
    for await (const chunk of stream) {
      // Chunks of data are returned as a Uint8Array. Convert it back to a string
      data += decoder.decode(chunk, { stream: true })
    }
    config = JSON.parse(data)
  } else {
    throw new Error('unsupported URI type')
  }

  return config
}

/**
 * Fetches a deployment from a URI.
 *
 * @param uri URI to fetch.
 * @param ipfsUrl Optional IPFS URL to fetch the URI.
 */
export const fetchDeploymentFromURI = async (
  uri: string,
  ipfsUrl?: string
): Promise<{
  merkleTree: SphinxMerkleTree
  compilerConfigs: Array<CompilerConfig>
  configArtifacts: ConfigArtifacts
  humanReadableActions: HumanReadableActions
}> => {
  const compilerConfigs = await callWithTimeout<Array<CompilerConfig>>(
    sphinxFetchSubtask({ configUri: uri, ipfsUrl }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const configArtifacts = await getConfigArtifactsRemote(compilerConfigs)

  const humanReadableActions: {
    [chainId: number]: Array<HumanReadableAction>
  } = {}

  for (const compilerConfig of compilerConfigs) {
    humanReadableActions[compilerConfig.chainId] = getReadableActions(
      compilerConfig.actions
    )
  }

  const { configUri } = await getParsedConfigWithCompilerInputs(
    compilerConfigs,
    false,
    configArtifacts
  )

  const deploymentData = makeDeploymentData(configUri, compilerConfigs)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  return {
    merkleTree,
    compilerConfigs,
    configArtifacts,
    humanReadableActions,
  }
}
