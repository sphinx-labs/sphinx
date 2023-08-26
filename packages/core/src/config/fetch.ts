import { create, IPFSHTTPClient } from 'ipfs-http-client'

import { SphinxBundles } from '../actions/types'
import {
  callWithTimeout,
  getDeploymentId,
  getConfigArtifactsRemote,
} from '../utils'
import { SphinxJsonRpcProvider } from '../provider'
import { CompilerConfig, ConfigArtifacts, ConfigCache } from './types'
import { makeBundlesFromConfig } from '../actions/bundle'
import { getConfigCache } from './parse'
import { getSphinxRegistryAddress } from '../addresses'

export const sphinxFetchSubtask = async (args: {
  configUri: string
  ipfsUrl?: string
}): Promise<CompilerConfig> => {
  let config: CompilerConfig
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

export const verifyDeployment = async (
  configUri: string,
  deploymentId: string,
  configArtifacts: ConfigArtifacts,
  projectName: string,
  configCache: ConfigCache,
  ipfsUrl?: string
) => {
  const config = await callWithTimeout<CompilerConfig>(
    sphinxFetchSubtask({ configUri, ipfsUrl }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const bundles = makeBundlesFromConfig(config, configArtifacts, configCache)

  if (deploymentId !== getDeploymentId(bundles, configUri)) {
    throw new Error(
      'Deployment ID generated from downloaded config does NOT match given hash. Please report this error.'
    )
  }
}

/**
 * Compiles a remote SphinxBundle from a uri.
 *
 * @param configUri URI of the SphinxBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled SphinxBundle.
 */
export const compileRemoteBundles = async (
  provider: SphinxJsonRpcProvider,
  configUri: string
): Promise<{
  bundles: SphinxBundles
  compilerConfig: CompilerConfig
  configArtifacts: ConfigArtifacts
}> => {
  const compilerConfig = await callWithTimeout<CompilerConfig>(
    sphinxFetchSubtask({ configUri }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const configArtifacts = await getConfigArtifactsRemote(compilerConfig)

  const configCache = await getConfigCache(
    provider,
    compilerConfig,
    configArtifacts,
    getSphinxRegistryAddress(),
    compilerConfig.manager
  )

  const bundles = makeBundlesFromConfig(
    compilerConfig,
    configArtifacts,
    configCache
  )
  return {
    bundles,
    compilerConfig,
    configArtifacts,
  }
}
