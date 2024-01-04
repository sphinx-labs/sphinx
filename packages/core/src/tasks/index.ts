import * as dotenv from 'dotenv'
import { DeploymentData, SphinxTransaction } from '@sphinx-labs/contracts'

import { ConfigArtifacts, CompilerConfig, ParsedConfig } from '../config/types'
import { CompilerInput, getMinimumCompilerInput } from '../languages'

// Load environment variables from .env
dotenv.config()

export const getParsedConfigWithCompilerInputs = (
  parsedConfigs: Array<ParsedConfig>,
  configArtifacts: ConfigArtifacts
): Array<CompilerConfig> => {
  const sphinxInputs: Array<CompilerInput> = []
  const compilerConfigs: Array<CompilerConfig> = []

  for (const parsedConfig of parsedConfigs) {
    for (const actionInput of parsedConfig.actionInputs) {
      for (const { fullyQualifiedName } of actionInput.contracts) {
        const { buildInfo, artifact } = configArtifacts[fullyQualifiedName]
        if (!buildInfo || !artifact) {
          throw new Error(`Could not find artifact for: ${fullyQualifiedName}`)
        }

        const prevSphinxInput = sphinxInputs.find(
          (input) => input.solcLongVersion === buildInfo.solcLongVersion
        )

        const { language, settings, sources } = getMinimumCompilerInput(
          buildInfo.input,
          artifact.metadata
        )

        if (prevSphinxInput === undefined) {
          const sphinxInput: CompilerInput = {
            solcVersion: buildInfo.solcVersion,
            solcLongVersion: buildInfo.solcLongVersion,
            id: buildInfo.id,
            input: {
              language,
              settings,
              sources,
            },
          }
          sphinxInputs.push(sphinxInput)
        } else {
          prevSphinxInput.input.sources = {
            ...prevSphinxInput.input.sources,
            ...sources,
          }
        }
      }
    }

    const compilerConfig: CompilerConfig = {
      ...parsedConfig,
      inputs: sphinxInputs,
    }

    compilerConfigs.push(compilerConfig)
  }
  return compilerConfigs
}

export const makeDeploymentData = (
  parsedConfigArray: Array<ParsedConfig>
): DeploymentData => {
  const data: DeploymentData = {}
  for (const compilerConfig of parsedConfigArray) {
    // We only add a `DeploymentData` object for networks that have at least one `EXECUTE` leaf. If
    // we don't enforce this, the default behavior would be to add an `APPROVE` leaf without any
    // `EXECUTE` leaves on chains with empty deployments. This is only desirable if the user is
    // attempting to cancel a previously signed Merkle root, which isn't currently supported by our
    // plugin.
    if (compilerConfig.actionInputs.length === 0) {
      continue
    }

    const txs: SphinxTransaction[] = compilerConfig.actionInputs.map(
      (action) => {
        return {
          to: action.to,
          value: action.value,
          gas: action.gas,
          txData: action.txData,
          operation: action.operation,
          requireSuccess: action.requireSuccess,
        }
      }
    )

    data[compilerConfig.chainId] = {
      type: 'deployment',
      nonce: compilerConfig.nonce,
      executor: compilerConfig.executorAddress,
      safeProxy: compilerConfig.safeAddress,
      moduleProxy: compilerConfig.moduleAddress,
      uri: '',
      txs,
      arbitraryChain: compilerConfig.arbitraryChain,
    }
  }

  return data
}
