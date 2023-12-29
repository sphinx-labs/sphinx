import { ConfigArtifacts } from '@sphinx-labs/core'

import {
  callForgeScriptFunction,
  readFoundryContractArtifact,
} from '../../src/foundry/utils'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

export const makeMockSphinxContext = (
  mockedFullyQualifiedNames: Array<string>
) => {
  return {
    prompt: mockPrompt,
    makeGetConfigArtifacts: (
      artifactFolder: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _buildInfoFolder: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      projectRoot: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _cachePath: string
    ) => {
      return async (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _fullyQualifiedNames: Array<string>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _contractNames: Array<string>
      ) => {
        const configArtifacts: ConfigArtifacts = {}
        for (const name of mockedFullyQualifiedNames) {
          const artifact = await readFoundryContractArtifact(
            name,
            projectRoot,
            artifactFolder
          )
          configArtifacts[name] = {
            buildInfo: {
              id: '0',
            },
            artifact,
          } as any
        }
        return configArtifacts
      }
    },
  }
}

export const getSphinxModuleAddressFromScript = async (
  scriptPath: string,
  forkUrl: string,
  targetContract?: string
): Promise<string> => {
  const json = await callForgeScriptFunction<{
    0: { value: string }
  }>(scriptPath, 'sphinxModule()', [], forkUrl, targetContract)

  const safeAddress = json.returns[0].value

  return safeAddress
}
