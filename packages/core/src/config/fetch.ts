import { create, IPFSHTTPClient } from 'ipfs-http-client'

import { ChugSplashActionBundle } from '../actions'
import { Integration } from '../constants'
import { ArtifactPaths, bundleRemote } from '../languages'
import { computeBundleId } from '../utils'
import { CanonicalChugSplashConfig } from './types'

export const chugsplashFetchSubtask = async (args: {
  configUri: string
  ipfsUrl?: string
}): Promise<CanonicalChugSplashConfig> => {
  let config: CanonicalChugSplashConfig
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

export const verifyBundle = async (args: {
  configUri: string
  bundleId: string
  ipfsUrl: string
  artifactPaths: ArtifactPaths
  integration: Integration
}): Promise<{
  config: CanonicalChugSplashConfig
  bundle: ChugSplashActionBundle
}> => {
  const { configUri, bundleId, ipfsUrl } = args

  const config: CanonicalChugSplashConfig = await chugsplashFetchSubtask({
    configUri,
    ipfsUrl,
  })

  const bundle: ChugSplashActionBundle = await bundleRemote({
    canonicalConfig: config,
  })

  if (
    bundleId !== computeBundleId(bundle.root, bundle.actions.length, configUri)
  ) {
    throw new Error(
      'Bundle ID generated from downloaded config does NOT match given hash. Please report this error.'
    )
  }

  return {
    config,
    bundle,
  }
}

/**
 * Compiles a remote ChugSplashBundle from a uri.
 *
 * @param configUri URI of the ChugSplashBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled ChugSplashBundle.
 */
export const compileRemoteBundle = async (
  configUri: string
): Promise<{
  bundle: ChugSplashActionBundle
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  const canonicalConfig = await chugsplashFetchSubtask({ configUri })

  const bundle = await bundleRemote({
    canonicalConfig,
  })
  return { bundle, canonicalConfig }
}
