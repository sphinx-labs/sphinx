import { create, IPFSHTTPClient } from 'ipfs-http-client'

import { HumanReadableActions, SphinxBundles } from '../actions/types'
import {
  callWithTimeout,
  getConfigArtifactsRemote,
  isExtendedFunctionCallActionInput,
} from '../utils'
import {
  CompilerConfig,
  ConfigArtifacts,
  ExtendedDeployContractActionInput,
} from './types'
import { makeBundlesFromConfig } from '../actions/bundle'
import { SemVer } from '../types'

const parseCompilerAction = (
  action: ExtendedDeployContractActionInput | ExtendedDeployContractActionInput
) => {
  action.actionType = BigInt(action.actionType)
  if (isExtendedFunctionCallActionInput(action)) {
    action.nonce = BigInt(action.nonce)
  }

  return action
}

const parseCompilerVersion = (version: SemVer) => {
  version.major = BigInt(version.major)
  version.minor = BigInt(version.minor)
  version.patch = BigInt(version.patch)
  return version
}

// Todo ensure all of the bigints are properly parsed in the compiler config
const parseCompilerConfigBigInts = (config: CompilerConfig) => {
  config.chainId = BigInt(config.chainId)
  config.actionInputs = config.actionInputs.map(parseCompilerAction)
  config.newConfig.threshold = BigInt(config.newConfig.threshold)
  config.newConfig.version = parseCompilerVersion(config.newConfig.version)
  config.initialState.version = parseCompilerVersion(
    config.initialState.version
  )
  return config
}

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

  // TODO(ryan): Are you sure that JSON.parse converts strings to numbers? It seems like they're
  // always converted to strings, even if they're less than the max safe integer value. If that's
  // the case, could we remove this? Otherwise, I'm going to need to add similar logic to the TS
  // proposal function because we actually convert the compiler config to/from JSON now. In the
  // proposal logic, I had to deal with this same issue of certain fields in the CompilerConfig
  // either being bigints or strings. To resolve that, I made the CompilerConfig type generic, so
  // now we can either specify CompilerConfig<bigint> or CompilerConfig<string>. This seems to have
  // resolved things in the proposal logic, so maybe we can do the same thing here. Lmk if you want
  // more details.

  // The compiler config is converted to JSON before being committed to IPFS. This causes an issue for bigints
  // because JSON.stringify() converts bigints to strings, and then JSON.parse() converts them to numbers unless
  // they exceed the maximum safe integer value. As a result, some of our logic which is valid for bigints fails
  // when the values are converted to numbers. So we must convert the bigints back to strings here.
  // We do not need to worry about this when working with the local compiler config because it is not converted to
  // and from JSON.
  return parseCompilerConfigBigInts(config)
}

/**
 * Compiles a remote SphinxBundle from a uri.
 *
 * @param configUri URI of the SphinxBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled SphinxBundle.
 */
export const compileRemoteBundles = async (
  configUri: string
): Promise<{
  bundles: SphinxBundles
  compilerConfig: CompilerConfig
  configArtifacts: ConfigArtifacts
  humanReadableActions: HumanReadableActions
}> => {
  const compilerConfig = await callWithTimeout<CompilerConfig>(
    sphinxFetchSubtask({ configUri }),
    30000,
    'Failed to fetch config file from IPFS'
  )

  const configArtifacts = await getConfigArtifactsRemote(compilerConfig)

  const { bundles, humanReadableActions } = makeBundlesFromConfig(
    compilerConfig,
    configArtifacts
  )
  return {
    bundles,
    compilerConfig,
    configArtifacts,
    humanReadableActions,
  }
}
