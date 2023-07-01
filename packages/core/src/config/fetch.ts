import { providers } from 'ethers'
import { create, IPFSHTTPClient } from 'ipfs-http-client'

import { ChugSplashBundles } from '../actions/types'
import {
  callWithTimeout,
  getChugSplashManagerReadOnly,
  getChugSplashRegistryReadOnly,
  getDeploymentId,
  getProjectConfigArtifactsRemote,
} from '../utils'
import {
  CanonicalProjectConfig,
  ProjectConfigArtifacts,
  ProjectConfigCache,
} from './types'
import { makeBundlesFromConfig } from '../actions/bundle'
import { getProjectConfigCache } from './parse'

export const chugsplashFetchSubtask = async (args: {
  configUri: string
  ipfsUrl?: string
}): Promise<CanonicalProjectConfig> => {
  let config: CanonicalProjectConfig
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
  projectConfigArtifacts: ProjectConfigArtifacts,
  projectConfigCache: ProjectConfigCache,
  ipfsUrl?: string
) => {
  const config = await callWithTimeout<CanonicalProjectConfig>(
    chugsplashFetchSubtask({ configUri, ipfsUrl }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const bundles = makeBundlesFromConfig(
    config,
    projectConfigArtifacts,
    projectConfigCache
  )

  if (deploymentId !== getDeploymentId(bundles, configUri)) {
    throw new Error(
      'Deployment ID generated from downloaded config does NOT match given hash. Please report this error.'
    )
  }
}

/**
 * Compiles a remote ChugSplashBundle from a uri.
 *
 * @param configUri URI of the ChugSplashBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled ChugSplashBundle.
 */
export const compileRemoteBundles = async (
  provider: providers.JsonRpcProvider,
  configUri: string
): Promise<{
  bundles: ChugSplashBundles
  canonicalProjectConfig: CanonicalProjectConfig
  projectConfigArtifacts: ProjectConfigArtifacts
}> => {
  const canonicalProjectConfig = await callWithTimeout<CanonicalProjectConfig>(
    chugsplashFetchSubtask({ configUri }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const projectConfigArtifacts = await getProjectConfigArtifactsRemote(
    canonicalProjectConfig
  )

  const configCache = await getProjectConfigCache(
    provider,
    canonicalProjectConfig,
    projectConfigArtifacts,
    getChugSplashRegistryReadOnly(provider),
    getChugSplashManagerReadOnly(
      provider,
      canonicalProjectConfig.options.organizationID
    )
  )

  const bundles = makeBundlesFromConfig(
    canonicalProjectConfig,
    projectConfigArtifacts,
    configCache
  )
  return { bundles, canonicalProjectConfig, projectConfigArtifacts }
}
