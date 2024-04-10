import * as dotenv from 'dotenv'
import {
  DeploymentData,
  SphinxMerkleTree,
  SphinxTransaction,
} from '@sphinx-labs/contracts'

import {
  ConfigArtifacts,
  DeploymentConfig,
  NetworkConfig,
} from '../config/types'
import { COMPILER_CONFIG_VERSION } from '../networks'

// Load environment variables from .env
dotenv.config()

export const makeDeploymentConfig = (
  networkConfigs: Array<NetworkConfig>,
  configArtifacts: ConfigArtifacts,
  merkleTree: SphinxMerkleTree
): DeploymentConfig => {
  return {
    networkConfigs,
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

// TODO(end): gh: i'm not sure if this is a breaking change to the website. Particularly, i'm not
// sure which functions in the monorepo are used by the website.
