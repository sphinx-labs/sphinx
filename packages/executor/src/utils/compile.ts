import * as dotenv from 'dotenv'
import { SolcBuild } from 'hardhat/types'
import {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names'
import { add0x } from '@eth-optimism/core-utils'
import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  makeActionBundleFromConfig,
} from '@chugsplash/core'
import { create } from 'ipfs-http-client'
import { ContractArtifact, getCreationCode } from '@chugsplash/plugins'

// Load environment variables from .env
dotenv.config()

/**
 * Compiles a remote ChugSplashBundle from a uri.
 *
 * @param configUri URI of the ChugSplashBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled ChugSplashBundle.
 */
export const compileRemoteBundle = async (
  hre: any,
  configUri: string
): Promise<{
  bundle: ChugSplashActionBundle
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  const canonicalConfig = await fetchChugSplashConfig(configUri)
  const artifacts = await getArtifactsFromCanonicalConfig(hre, canonicalConfig)
  console.log('config')
  console.log(canonicalConfig)
  console.log(artifacts)
  const bundle = await makeActionBundleFromConfig(
    canonicalConfig,
    artifacts,
    {}
  )
  return { bundle, canonicalConfig }
}

export const getArtifactsFromCanonicalConfig = async (
  hre: any,
  canonicalConfig: CanonicalChugSplashConfig
): Promise<{
  [contractName: string]: ContractArtifact
}> => {
  const artifacts = {}
  for (const source of canonicalConfig.inputs) {
    const solcBuild: SolcBuild = await hre.run(
      TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
      {
        quiet: true,
        solcVersion: source.solcVersion,
      }
    )

    let output: any // TODO: Compiler output
    if (solcBuild.isSolcJs) {
      output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
        input: source.input,
        solcJsPath: solcBuild.compilerPath,
      })
    } else {
      output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLC, {
        input: source.input,
        solcPath: solcBuild.compilerPath,
      })
    }

    for (const [sourceName, fileOutput] of Object.entries(output.contracts)) {
      for (const [contractName, contractOutput] of Object.entries(fileOutput)) {
        console.log(sourceName)
        console.log(canonicalConfig)
        // const creationCode = await getCreationCode(canonicalConfig, sourceName)
        artifacts[contractName] = {
          bytecode: add0x(contractOutput.evm.bytecode.object),
          // creationCode,
          storageLayout: contractOutput.storageLayout,
          contractName,
          sourceName,
          abi: contractOutput.abi,
          sources: output.sources,
          immutableReferences:
            output.contracts[sourceName][contractName].evm.deployedBytecode
              .immutableReferences,
        }
      }
    }
  }
  return artifacts
}

// TODO: change file name or add another file
export const fetchChugSplashConfig = async (
  configUri: string
): Promise<CanonicalChugSplashConfig> => {
  const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
  const ipfs = create({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https',
    headers: {
      authorization: `Basic ${Buffer.from(projectCredentials).toString(
        'base64'
      )}`,
    },
  })

  let config: CanonicalChugSplashConfig
  if (configUri.startsWith('ipfs://')) {
    const decoder = new TextDecoder()
    let data = ''
    const stream = await ipfs.cat(configUri.replace('ipfs://', ''))
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
