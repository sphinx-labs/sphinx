import * as dotenv from 'dotenv'
import {
  DeploymentData,
  SphinxMerkleTree,
  SphinxTransaction,
} from '@sphinx-labs/contracts'

import {
  BuildInfos,
  ConfigArtifacts,
  DeploymentConfig,
  NetworkConfig,
} from '../config/types'
import { CompilerInput, getMinimumCompilerInput } from '../languages'
import { COMPILER_CONFIG_VERSION } from '../networks'

// Load environment variables from .env
dotenv.config()

export const makeDeploymentConfig = (
  networkConfigs: Array<NetworkConfig>,
  configArtifacts: ConfigArtifacts,
  buildInfos: BuildInfos,
  merkleTree: SphinxMerkleTree
): DeploymentConfig => {
  const sphinxInputs: Array<CompilerInput> = []

  for (const networkConfig of networkConfigs) {
    for (const actionInput of networkConfig.actionInputs) {
      for (const { fullyQualifiedName } of actionInput.contracts) {
        const { buildInfoId, artifact } = configArtifacts[fullyQualifiedName]
        const buildInfo = buildInfos[buildInfoId]
        if (!buildInfos[buildInfoId] || !artifact) {
          throw new Error(`Could not find artifact for: ${fullyQualifiedName}`)
        }

        // Check if we've already added the current build info to the inputs array. If we have,
        // we'll merge the new sources into the existing sources. Otherwise, we'll create a new
        // element in the inputs array.
        const prevSphinxInput = sphinxInputs.find(
          (input) => input.id === buildInfo.id
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
  }

  return {
    networkConfigs,
    buildInfos,
    inputs: sphinxInputs,
    version: COMPILER_CONFIG_VERSION,
    merkleTree,
    configArtifacts,
  }
}

export const makeDeploymentData = (
  networkConfigArray: Array<NetworkConfig>
): DeploymentData => {
  const data: DeploymentData = {}
  for (const deploymentConfig of networkConfigArray) {
    // We only add a `DeploymentData` object for networks that have at least one `EXECUTE` leaf. If
    // we don't enforce this, the default behavior would be to add an `APPROVE` leaf without any
    // `EXECUTE` leaves on chains with empty deployments. This is only desirable if the user is
    // attempting to cancel a previously signed Merkle root, which isn't currently supported by our
    // plugin.
    if (deploymentConfig.actionInputs.length === 0) {
      continue
    }

    const txs: SphinxTransaction[] = deploymentConfig.actionInputs.map(
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

    data[deploymentConfig.chainId] = {
      type: 'deployment',
      nonce: deploymentConfig.nonce,
      executor: deploymentConfig.executorAddress,
      safeProxy: deploymentConfig.safeAddress,
      moduleProxy: deploymentConfig.moduleAddress,
      uri: '',
      txs,
      arbitraryChain: deploymentConfig.arbitraryChain,
    }
  }

  return data
}
