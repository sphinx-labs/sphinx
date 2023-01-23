import { SolcBuild } from 'hardhat/types'
import { getCompilersDir } from 'hardhat/internal/util/global-dir'
import {
  CompilerDownloader,
  CompilerPlatform,
} from 'hardhat/internal/solidity/compiler/downloader'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'
import { add0x } from '@eth-optimism/core-utils'

import {
  CanonicalChugSplashConfig,
  chugsplashFetchSubtask,
  makeActionBundleFromConfig,
} from '../../config'
import {
  ChugSplashActionBundle,
  getCreationCodeWithConstructorArgs,
  getImmutableVariables,
} from '../../actions'
import { CompilerInput, CompilerOutput, CompilerOutputSources } from './types'
import { addEnumMembersToStorageLayout } from './storage'

export const bundleRemote = async (args: {
  canonicalConfig: CanonicalChugSplashConfig
}): Promise<ChugSplashActionBundle> => {
  const { canonicalConfig } = args

  const artifacts = await getCanonicalConfigArtifacts(canonicalConfig)

  return makeActionBundleFromConfig(canonicalConfig, artifacts)
}

// Credit: NomicFoundation
// https://github.com/NomicFoundation/hardhat/blob/main/packages/hardhat-core/src/builtin-tasks/compile.ts
export const getSolcBuild = async (solcVersion: string): Promise<SolcBuild> => {
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

  if (wasmCompiler === undefined) {
    throw new Error(`Could not get WASM compiler.`)
  }

  return wasmCompiler
}

// TODO: `CanonicalConfigArtifact` type
export const getCanonicalConfigArtifacts = async (
  canonicalConfig: CanonicalChugSplashConfig
): Promise<{ [referenceName: string]: any }> => {
  const compilerOutputs: any[] = []
  // Get the compiler output for each compiler input.
  for (const compilerInput of canonicalConfig.inputs) {
    const solcBuild: SolcBuild = await getSolcBuild(compilerInput.solcVersion)
    let compilerOutput: CompilerOutput
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
    // Split the contract's fully qualified name into its source name and contract name.
    const [sourceName, contractName] = contractConfig.contract.split(':')

    for (const compilerOutput of compilerOutputs) {
      const contractOutput =
        compilerOutput.contracts?.[sourceName]?.[contractName]
      if (contractOutput !== undefined) {
        const creationCode = getCreationCodeWithConstructorArgs(
          add0x(contractOutput.evm.bytecode.object),
          canonicalConfig,
          referenceName,
          contractOutput.abi,
          compilerOutput,
          sourceName,
          contractName
        )
        const immutableVariables = getImmutableVariables(
          compilerOutput,
          sourceName,
          contractName
        )

        addEnumMembersToStorageLayout(
          contractOutput.storageLayout,
          contractName,
          compilerOutput.sources[sourceName].ast.nodes
        )

        artifacts[referenceName] = {
          creationCode,
          storageLayout: contractOutput.storageLayout,
          immutableVariables,
          abi: contractOutput.abi,
          compilerOutput,
          sourceName,
          contractName,
        }
      }
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

  const bundle = await bundleRemote({
    canonicalConfig,
  })
  return { bundle, canonicalConfig }
}

/**
 * Returns the minimum compiler input necessary to compile a given source name. All contracts that
 * are imported in the given source must be included in the minimum compiler input.
 *
 * @param fullCompilerInput The full compiler input object.
 * @param fullOutputSources The full compiler output source object.
 * @param sourceName The source name.
 * @returns Minimum compiler input necessary to compile the source name.
 */
export const getMinimumCompilerInput = (
  fullCompilerInput: CompilerInput,
  fullOutputSources: CompilerOutputSources,
  sourceName: string
): CompilerInput => {
  const { language, settings, sources: inputSources } = fullCompilerInput

  const minimumInputSources: CompilerInput['sources'] = {}
  const minimumCompilerInput: CompilerInput = {
    language,
    settings,
    sources: minimumInputSources,
  }

  // Each contract name has a unique AST ID in the compiler output. These will
  // be necessary when we parse the compiler output later.
  const contractAstIdsToSourceNames =
    mapContractAstIdsToSourceNames(fullOutputSources)

  // Get the source names that are necessary to compile the given source name.
  const minimumSourceNames = getMinimumSourceNames(
    sourceName,
    fullOutputSources,
    contractAstIdsToSourceNames,
    [sourceName]
  )

  // Filter out any sources that are in the full compiler input but not in the minimum compiler
  // input.
  for (const [source, content] of Object.entries(inputSources)) {
    if (minimumSourceNames.includes(source)) {
      minimumInputSources[source] = content
    }
  }

  return minimumCompilerInput
}

/**
 * Recursively get the minimum list of source names necessary to compile a given source name. All
 * source names that are referenced in the given source name must be included in this list.
 *
 * @param sourceName The source name.
 * @param fullOutputSources The full compiler output source object.
 * @param contractAstIdsToSourceNames Mapping from contract AST IDs to source names.
 * @param minimumSourceNames Array of minimum source names.
 * @returns
 */
export const getMinimumSourceNames = (
  sourceName: string,
  fullOutputSources: CompilerOutputSources,
  contractAstIdsToSourceNames: { [astId: number]: string },
  minimumSourceNames: string[]
): string[] => {
  // The exported symbols object contains the AST IDs corresponding to the contracts that must be
  // included in the list of minimum source names for the given source.
  const exportedSymbols = fullOutputSources[sourceName].ast.exportedSymbols

  for (const astIds of Object.values(exportedSymbols)) {
    if (astIds.length > 1) {
      throw new Error(
        `Detected more than one AST ID for: ${sourceName}. Please report this error.`
      )
    }
    const astId = astIds[0]
    const nextSourceName = contractAstIdsToSourceNames[astId]
    if (!minimumSourceNames.includes(nextSourceName)) {
      minimumSourceNames.push(nextSourceName)
      minimumSourceNames = getMinimumSourceNames(
        nextSourceName,
        fullOutputSources,
        contractAstIdsToSourceNames,
        minimumSourceNames
      )
    }
  }
  return minimumSourceNames
}

export const mapContractAstIdsToSourceNames = (
  outputSources: CompilerOutputSources
): { [astId: number]: string } => {
  const contractAstIdsToSourceNames: { [astId: number]: string } = {}
  for (const [sourceName, { ast }] of Object.entries(outputSources)) {
    if (ast.nodes !== undefined) {
      for (const node of ast.nodes) {
        if (node.name !== undefined) {
          contractAstIdsToSourceNames[node.id] = sourceName
        }
      }
    }
  }
  return contractAstIdsToSourceNames
}
