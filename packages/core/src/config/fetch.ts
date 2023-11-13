import { create, IPFSHTTPClient } from 'ipfs-http-client'
import { SphinxBundle } from '@sphinx-labs/contracts'

import { HumanReadableAction } from '../actions/types'
import { callWithTimeout, getConfigArtifactsRemote } from '../utils'
import { CompilerConfig, ConfigArtifacts } from './types'
import { getBundleInfo } from '../tasks'

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
 * Compiles a remote SphinxBundle from a uri.
 *
 * @param configUri URI of the SphinxBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled SphinxBundle.
 */
export const compileRemoteBundles = async (
  configUri: string,
  ipfsUrl?: string
): Promise<{
  bundle: SphinxBundle
  compilerConfigs: Array<CompilerConfig>
  configArtifacts: ConfigArtifacts
  humanReadableActions: Array<HumanReadableAction>
}> => {
  const compilerConfigs = await callWithTimeout<Array<CompilerConfig>>(
    sphinxFetchSubtask({ configUri, ipfsUrl }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const configArtifacts = await getConfigArtifactsRemote(compilerConfigs)

  const { bundleInfo } = await getBundleInfo(configArtifacts, compilerConfigs)

  return {
    bundle: bundleInfo.bundle,
    compilerConfigs,
    configArtifacts,
    // TODO - do something with human readable actions
    humanReadableActions: [],
  }
}
