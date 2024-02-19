import { CompilerOutputMetadata } from '@sphinx-labs/contracts'

import { SolcInput } from './types'

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
  fullCompilerInput: SolcInput,
  metadata: CompilerOutputMetadata
): SolcInput => {
  const minimumSources: SolcInput['sources'] = {}
  for (const newSourceName of Object.keys(metadata.sources)) {
    minimumSources[newSourceName] = fullCompilerInput.sources[newSourceName]
  }

  const { language, settings } = fullCompilerInput
  const minimumCompilerInput: SolcInput = {
    language,
    settings,
    sources: minimumSources,
  }

  return minimumCompilerInput
}
