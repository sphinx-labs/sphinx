import { BuildInfo, ConfigArtifacts, isLiveNetwork } from '@sphinx-labs/core'

import {
  callForgeScriptFunction,
  readContractArtifact,
} from '../../src/foundry/utils'
import { propose } from '../../src/cli/propose'
import { deploy } from '../../src/cli/deploy'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

export const makeMockSphinxContext = (
  mockedFullyQualifiedNames: Array<string>
) => {
  return {
    isLiveNetwork,
    propose,
    deploy,
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
          const artifact = await readContractArtifact(
            name,
            projectRoot,
            artifactFolder
          )
          const buildInfo: BuildInfo = {
            id: '0',
            solcVersion: '0.8.0',
            solcLongVersion: '0.8.21+commit.d9974bed',
            input: {
              language: 'Solidity',
              settings: {
                optimizer: {
                  runs: undefined,
                  enabled: undefined,
                  details: undefined,
                },
                outputSelection: {},
              },
              sources: {},
            },
            output: {
              sources: {},
              contracts: {},
            },
          }
          configArtifacts[name] = {
            buildInfo,
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
