import * as dotenv from 'dotenv'
import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  makeActionBundleFromConfig,
  parseChugSplashConfig,
  getCreationCode,
  getImmutableVariables,
  chugsplashFetchSubtask,
} from '@chugsplash/core'
import { SolcBuild } from 'hardhat/types'
import { getCompilersDir } from 'hardhat/internal/util/global-dir'
import {
  CompilerDownloader,
  CompilerPlatform,
} from 'hardhat/internal/solidity/compiler/downloader'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'
import { add0x } from '@eth-optimism/core-utils'

// Load environment variables from .env
dotenv.config()

export const bundleRemoteSubtask = async (args: {
  canonicalConfig: CanonicalChugSplashConfig
}): Promise<ChugSplashActionBundle> => {
  const parsedCanonicalConfig = parseChugSplashConfig(
    args.canonicalConfig
  ) as CanonicalChugSplashConfig

  const artifacts = await getArtifactsFromParsedCanonicalConfig(
    parsedCanonicalConfig
  )

  return makeActionBundleFromConfig(
    parsedCanonicalConfig,
    artifacts,
    process.env
  )
}

// Credit: NomicFoundation
// https://github.com/NomicFoundation/hardhat/blob/main/packages/hardhat-core/src/builtin-tasks/compile.ts
export const getSolcBuild = async (solcVersion: string) => {
  const compilersCache = await getCompilersDir()

  const compilerPlatform = CompilerDownloader.getCompilerPlatform()
  const downloader = CompilerDownloader.getConcurrencySafeDownloader(
    compilerPlatform,
    compilersCache
  )

  const isCompilerDownloaded = await downloader.isCompilerDownloaded(
    solcVersion
  )

  if (!isCompilerDownloaded) {
    console.log(`Downloading compiler version ${solcVersion}`)
    await downloader.downloadCompiler(solcVersion)
  }

  const compiler = await downloader.getCompiler(solcVersion)

  if (compiler !== undefined) {
    return compiler
  }

  const wasmDownloader = CompilerDownloader.getConcurrencySafeDownloader(
    CompilerPlatform.WASM,
    compilersCache
  )

  const isWasmCompilerDownloader = await wasmDownloader.isCompilerDownloaded(
    solcVersion
  )

  if (!isWasmCompilerDownloader) {
    console.log(`Downloading compiler version ${solcVersion}`)
    await wasmDownloader.downloadCompiler(solcVersion)
  }

  const wasmCompiler = await wasmDownloader.getCompiler(solcVersion)
  return wasmCompiler
}

export const getArtifactsFromParsedCanonicalConfig = async (
  parsedCanonicalConfig: CanonicalChugSplashConfig
): Promise<{ [referenceName: string]: any }> => {
  const compilerOutputs: any[] = []
  // Get the compiler output for each compiler input.
  for (const compilerInput of parsedCanonicalConfig.inputs) {
    const solcBuild: SolcBuild = await getSolcBuild(compilerInput.solcVersion)
    let compilerOutput: any // TODO: Compiler output type
    if (solcBuild.isSolcJs) {
      const compiler = new Compiler(solcBuild.compilerPath)
      compilerOutput = await compiler.compile(compilerInput.input)
    } else {
      const compiler = new NativeCompiler(solcBuild.compilerPath)
      compilerOutput = await compiler.compile(compilerInput.input)
    }
    compilerOutputs.push(compilerOutput)
  }

  const artifacts = {}
  // Generate an artifact for each contract in the ChugSplash config.
  for (const [referenceName, contractConfig] of Object.entries(
    parsedCanonicalConfig.contracts
  )) {
    let compilerOutputIndex = 0
    while (artifacts[referenceName] === undefined) {
      // Iterate through the sources in the current compiler output to find the one that
      // contains this contract.
      const compilerOutput = compilerOutputs[compilerOutputIndex]
      for (const [sourceName, sourceOutput] of Object.entries(
        compilerOutput.contracts
      )) {
        // Check if the current source contains the contract.
        if (sourceOutput.hasOwnProperty(contractConfig.contract)) {
          const contractOutput = sourceOutput[contractConfig.contract]

          const creationCode = getCreationCode(
            add0x(contractOutput.evm.bytecode.object),
            parsedCanonicalConfig,
            referenceName,
            contractOutput.abi,
            compilerOutput,
            sourceName,
            contractConfig.contract
          )
          const immutableVariables = getImmutableVariables(
            compilerOutput,
            sourceName,
            contractConfig.contract
          )

          artifacts[referenceName] = {
            creationCode,
            storageLayout: contractOutput.storageLayout,
            immutableVariables,
            abi: contractOutput.abi,
            compilerOutput,
            sourceName,
            contractName: contractConfig.contract,
          }
          // We can exit the loop at this point since each contract only has a single artifact
          // associated with it.
          break
        }
      }
      compilerOutputIndex += 1
    }
  }
  return artifacts
}

/**
 * Compiles a remote ChugSplashBundle from a uri.
 *
 * @param configUri URI of the ChugSplashBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled ChugSplashBundle.
 */
export const compileRemoteBundle = async (
  configUri: string,
  canonicalConfig?: CanonicalChugSplashConfig
): Promise<{
  bundle: ChugSplashActionBundle
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  // canonicalConfig is passed in when executing a local deployment
  if (!canonicalConfig) {
    canonicalConfig = await chugsplashFetchSubtask({ configUri })
  }

  const bundle = await bundleRemoteSubtask({ canonicalConfig })
  return { bundle, canonicalConfig }
}
