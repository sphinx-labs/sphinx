import process from 'process'

import * as dotenv from 'dotenv'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import {
  DeploymentData,
  SphinxTransaction,
  makeSphinxBundle,
} from '@sphinx-labs/contracts'

import {
  BuildInfoInputs,
  ConfigArtifacts,
  CompilerConfig,
  ParsedConfig,
  BundleInfo,
} from '../config/types'
import { getMinimumCompilerInput } from '../languages'

// Load environment variables from .env
dotenv.config()

export const sphinxCommitAbstractSubtask = async (
  parsedConfigs: Array<ParsedConfig>,
  commitToIpfs: boolean,
  configArtifacts: ConfigArtifacts,
  ipfsUrl?: string
): Promise<{
  configUri: string
  compilerConfigs: Array<CompilerConfig>
}> => {
  const sphinxInputs: Array<BuildInfoInputs> = []
  const compilerConfigs: Array<CompilerConfig> = []

  for (const parsedConfig of parsedConfigs) {
    for (const actionInput of parsedConfig.actionInputs) {
      for (const address of Object.keys(actionInput.contracts)) {
        const { fullyQualifiedName } = actionInput.contracts[address]

        const { buildInfo, artifact } = configArtifacts[fullyQualifiedName]

        const prevSphinxInput = sphinxInputs.find(
          (input) => input.solcLongVersion === buildInfo.solcLongVersion
        )

        const { language, settings, sources } = getMinimumCompilerInput(
          buildInfo.input,
          artifact.metadata
        )

        if (prevSphinxInput === undefined) {
          const sphinxInput: BuildInfoInputs = {
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

  const ipfsData = JSON.stringify(compilerConfigs, null, 2)

  let ipfsHash
  if (!commitToIpfs) {
    // Get the IPFS hash without publishing anything on IPFS.
    ipfsHash = await Hash.of(ipfsData)
  } else if (ipfsUrl) {
    const ipfs = create({
      url: ipfsUrl,
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else if (process.env.IPFS_PROJECT_ID && process.env.IPFS_API_KEY_SECRET) {
    const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
    const ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: {
        authorization: `Basic ${Buffer.from(projectCredentials).toString(
          'base64'
        )}`,
      },
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else {
    throw new Error(
      `To commit to IPFS, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const configUri = `ipfs://${ipfsHash}`

  return { configUri, compilerConfigs }
}

export const makeDeploymentData = (
  configUri: string,
  compilerConfigArray: Array<CompilerConfig>
): DeploymentData => {
  const data: DeploymentData = {}
  for (const compilerConfig of compilerConfigArray) {
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
      nonce: compilerConfig.nonce,
      executor: compilerConfig.executorAddress,
      safeProxy: compilerConfig.safeAddress,
      moduleProxy: compilerConfig.moduleAddress,
      deploymentURI: configUri,
      txs,
    }
  }

  return data
}

export const getBundleInfo = async (
  configArtifacts: ConfigArtifacts,
  parsedConfigArray: Array<ParsedConfig>
): Promise<{
  configUri: string
  root: string
  bundleInfo: BundleInfo
}> => {
  const { configUri, compilerConfigs } = await sphinxCommitAbstractSubtask(
    parsedConfigArray,
    false,
    configArtifacts
  )

  const deploymentData = makeDeploymentData(configUri, compilerConfigs)
  const bundle = makeSphinxBundle(deploymentData)
  return {
    configUri,
    root: bundle.root,
    bundleInfo: {
      bundle,
      compilerConfigs,
    },
  }
}
