import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  makeActionBundleFromConfig,
  getCreationCodeWithConstructorArgs,
  getImmutableVariables,
  chugsplashFetchSubtask,
  CompilerInput,
  CompilerOutput,
} from '@chugsplash/core'
import { SolcBuild } from 'hardhat/types'
import { getCompilersDir } from 'hardhat/internal/util/global-dir'
import {
  CompilerDownloader,
  CompilerPlatform,
} from 'hardhat/internal/solidity/compiler/downloader'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'
import { add0x } from '@eth-optimism/core-utils'

export const bundleRemoteSubtask = async (args: {
  canonicalConfig: CanonicalChugSplashConfig
}): Promise<ChugSplashActionBundle> => {
  const { canonicalConfig } = args

  const artifacts = await getArtifactsFromCanonicalConfig(canonicalConfig)

  return makeActionBundleFromConfig(canonicalConfig, artifacts)
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

export const getArtifactsFromCanonicalConfig = async (
  canonicalConfig: CanonicalChugSplashConfig
): Promise<{ [referenceName: string]: any }> => {
  const compilerOutputs: any[] = []
  // Get the compiler output for each compiler input.
  for (const compilerInput of canonicalConfig.inputs) {
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
    canonicalConfig.contracts
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

          const creationCode = getCreationCodeWithConstructorArgs(
            add0x(contractOutput.evm.bytecode.object),
            canonicalConfig,
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
  configUri: string
): Promise<{
  bundle: ChugSplashActionBundle
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  const canonicalConfig = await chugsplashFetchSubtask({ configUri })

  const bundle = await bundleRemoteSubtask({ canonicalConfig })
  return { bundle, canonicalConfig }
}

export const compile = async (
  compilerInput: CompilerInput,
  solcVersion: string
): Promise<CompilerOutput> => {
  const solcBuild: SolcBuild = await getSolcBuild(solcVersion)
  let compilerOutput
  if (solcBuild.isSolcJs) {
    const compiler = new Compiler(solcBuild.compilerPath)
    compilerOutput = await compiler.compile(compilerInput)
  } else {
    const compiler = new NativeCompiler(solcBuild.compilerPath)
    compilerOutput = await compiler.compile(compilerInput)
  }

  if (compilerOutput.errors !== undefined) {
    throw new Error(`Compilation error(s):
${compilerOutput.errors.map((error, i) => `\n${i + 1}: ${error.message}`)}\n`)
  }

  return compilerOutput
}
