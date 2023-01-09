import { create, IPFSHTTPClient } from 'ipfs-http-client'

import { ChugSplashActionBundle } from '../actions'
import { bundleRemote } from '../languages'
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
  silent: boolean
}): Promise<{
  config: CanonicalChugSplashConfig
  bundle: ChugSplashActionBundle
}> => {
  const config: CanonicalChugSplashConfig = await chugsplashFetchSubtask({
    configUri: args.configUri,
    ipfsUrl: args.ipfsUrl,
  })

  const bundle: ChugSplashActionBundle = await bundleRemote({
    canonicalConfig: config,
  })

  const bundleId = computeBundleId(
    bundle.root,
    bundle.actions.length,
    args.configUri
  )

  if (bundleId !== args.bundleId) {
    throw new Error(
      'Bundle ID generated from downloaded config does NOT match given hash. Please report this error.'
    )
  }

  return {
    config,
    bundle,
  }
}
