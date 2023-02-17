import { SolcBuild } from 'hardhat/types'
import { getCompilersDir } from 'hardhat/internal/util/global-dir'
import {
  CompilerDownloader,
  CompilerPlatform,
} from 'hardhat/internal/solidity/compiler/downloader'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'
import { add0x } from '@eth-optimism/core-utils'

import { CanonicalChugSplashConfig } from '../../config/types'
import {
  ChugSplashActionBundle,
  getCreationCodeWithConstructorArgs,
  makeActionBundleFromConfig,
} from '../../actions'
import {
  CompilerInput,
  CompilerOutput,
  CompilerOutputContracts,
  CompilerOutputMetadata,
  CompilerOutputSources,
} from './types'
import { addEnumMembersToStorageLayout } from '../../utils'

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

    if (compilerOutput.errors) {
      const formattedErrorMessages: string[] = []
      compilerOutput.errors.forEach((error) => {
        // Ignore warnings thrown by the compiler.
        if (error.type.toLowerCase() !== 'warning') {
          formattedErrorMessages.push(error.formattedMessage)
        }
      })

      if (formattedErrorMessages.length > 0) {
        throw new Error(
          `Failed to compile. Please report this error to ChugSplash.\n` +
            `${formattedErrorMessages}`
        )
      }
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
          contractOutput.abi
        )

        addEnumMembersToStorageLayout(
          contractOutput.storageLayout,
          contractName,
          compilerOutput.sources[sourceName].ast.nodes
        )

        artifacts[referenceName] = {
          creationCode,
          storageLayout: contractOutput.storageLayout,
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
  fullOutputContracts: CompilerOutputContracts,
  sourceName: string,
  contractName: string
): CompilerInput => {
  const contractOutput = fullOutputContracts[sourceName][contractName]
  const metadata: CompilerOutputMetadata =
    typeof contractOutput.metadata === 'string'
      ? JSON.parse(contractOutput.metadata)
      : contractOutput.metadata

  const minimumSources: CompilerInput['sources'] = {}
  for (const newSourceName of Object.keys(metadata.sources)) {
    minimumSources[newSourceName] = fullCompilerInput.sources[newSourceName]
  }

  const { language, settings } = fullCompilerInput
  const minimumCompilerInput: CompilerInput = {
    language,
    settings,
    sources: minimumSources,
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
