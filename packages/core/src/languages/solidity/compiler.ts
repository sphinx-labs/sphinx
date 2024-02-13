import { CompilerInput } from 'hardhat/types'
import { CompilerOutputMetadata } from '@sphinx-labs/contracts'

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
  metadata: CompilerOutputMetadata
): CompilerInput => {
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
