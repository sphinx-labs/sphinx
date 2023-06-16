import { providers } from 'ethers'
import { create, IPFSHTTPClient } from 'ipfs-http-client'

import { ChugSplashBundles } from '../actions/types'
import { bundleRemoteSubtask } from '../languages/solidity/compiler'
import { callWithTimeout, computeDeploymentId } from '../utils'
import { CanonicalChugSplashConfig } from './types'
import { getDeployContractActions } from '../actions/bundle'

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

export const verifyDeployment = async (
  provider: providers.Provider,
  configUri: string,
  deploymentId: string,
  ipfsUrl: string
) => {
  const config = await callWithTimeout<CanonicalChugSplashConfig>(
    chugsplashFetchSubtask({ configUri, ipfsUrl }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const { actionBundle, targetBundle } = await bundleRemoteSubtask({
    provider,
    canonicalConfig: config,
  })

  if (
    deploymentId !==
    computeDeploymentId(
      actionBundle.root,
      targetBundle.root,
      actionBundle.actions.length,
      targetBundle.targets.length,
      getDeployContractActions(actionBundle).length,
      configUri
    )
  ) {
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
  provider: providers.Provider,
  configUri: string
): Promise<{
  bundles: ChugSplashBundles
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  const canonicalConfig = await callWithTimeout<CanonicalChugSplashConfig>(
    chugsplashFetchSubtask({ configUri }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const bundles = await bundleRemoteSubtask({ provider, canonicalConfig })
  return { bundles, canonicalConfig }
}
