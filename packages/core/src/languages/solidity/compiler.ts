import { CompilerInput, CompilerOutputSources } from './types'

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
  for (const [sourceName, { ast }] of Object.entries(outputSources) as any) {
    for (const node of ast.nodes) {
      if (node.canonicalName !== undefined) {
        contractAstIdsToSourceNames[node.id] = sourceName
      }
    }
  }
  return contractAstIdsToSourceNames
}
