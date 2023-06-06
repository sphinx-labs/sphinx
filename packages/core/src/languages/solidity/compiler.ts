import { CompilerInput, SolcBuild } from 'hardhat/types'
import { getCompilersDir } from 'hardhat/internal/util/global-dir'
import {
  CompilerDownloader,
  CompilerPlatform,
} from 'hardhat/internal/solidity/compiler/downloader'

import {
  CompilerOutput,
  CompilerOutputContracts,
  CompilerOutputMetadata,
} from './types'

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
 * Returns the minimum compiler output for a given source name.
 *
 * @param fullCompilerOutput The full compiler output object.
 * @param fullOutputContracts The full compiler output contract object.
 * @param sourceName The source name.
 * @returns Minimum compiler input necessary to compile the source name.
 */
export const getMinimumCompilerOutput = (
  fullCompilerOutput: CompilerOutput,
  fullOutputContracts: CompilerOutputContracts,
  sourceName: string,
  contractName: string
): CompilerOutput => {
  const contractOutput = fullOutputContracts[sourceName][contractName]
  const metadata: CompilerOutputMetadata =
    typeof contractOutput.metadata === 'string'
      ? JSON.parse(contractOutput.metadata)
      : contractOutput.metadata

  const minimumSources: CompilerOutput['sources'] = {}
  const minimumContracts: CompilerOutput['contracts'] = {}
  for (const newSourceName of Object.keys(metadata.sources)) {
    minimumSources[newSourceName] = fullCompilerOutput.sources[newSourceName]
    minimumContracts[newSourceName] =
      fullCompilerOutput.contracts[newSourceName]
  }

  const minimumCompilerOutput: CompilerOutput = {
    contracts: minimumContracts,
    sources: minimumSources,
  }

  return minimumCompilerOutput
}
