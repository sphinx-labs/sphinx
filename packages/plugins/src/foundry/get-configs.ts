import { resolve } from 'path'

import {
  getFoundryConfig,
  readUserSphinxConfig,
} from '@sphinx-labs/core/dist/config/config'
import { AbiCoder, concat } from 'ethers'
import {
  ValidationError,
  assertValidPostDeploymentActions,
  assertValidUserConfig,
  getUnvalidatedContractConfigs,
  parsePostDeploymentActions,
  resolveContractReferences,
} from '@sphinx-labs/core/dist/config/parse'
import { FailureAction } from '@sphinx-labs/core/dist/types'
import { remove0x } from '@sphinx-labs/core/dist/utils'
import { SUPPORTED_NETWORKS } from '@sphinx-labs/core/dist/networks'
import { getSphinxManagerAddress } from '@sphinx-labs/core/dist/addresses'

import { getEncodedFailure, validationStderrWrite } from './logs'
import { getFoundryConfigOptions } from './options'
import { createSphinxRuntime } from '../cre'
import { makeGetConfigArtifacts } from './utils'

const args = process.argv.slice(2)
const configPath = args[0]
const ownerAddress = args[1]
const chainId = args[2]

// This function is in its own file to minimize the number of dependencies that are imported, as
// this speeds up the execution time of the script when called via FFI from Foundry. Note that this
// function must not rely on a provider object being available because a provider doesn't exist
// outside of Solidity for the in-process Anvil node.
;(async () => {
  process.stderr.write = validationStderrWrite
  try {
    const userConfig = await readUserSphinxConfig(configPath)

    const {
      artifactFolder,
      buildInfoFolder,
      compilerConfigFolder,
      storageLayout,
      gasEstimates,
      cachePath,
    } = await getFoundryConfigOptions()

    if (!storageLayout || !gasEstimates) {
      throw Error(
        "foundry.toml file must include both 'storageLayout' and 'evm.gasEstimates' in 'extra_output':\n extra_output = ['storageLayout', 'evm.gasEstimates']"
      )
    }

    const rootImportPath =
      process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'
    const utilsArtifactFolder = `${rootImportPath}out/artifacts`

    const SphinxUtilsABI =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(resolve(
        `${utilsArtifactFolder}/SphinxUtils.sol/SphinxUtils.json`
      )).abi

    const cre = createSphinxRuntime(
      'foundry',
      false,
      false,
      true,
      compilerConfigFolder,
      undefined,
      false,
      process.stderr
    )

    const getConfigArtifacts = makeGetConfigArtifacts(
      artifactFolder,
      buildInfoFolder,
      cachePath
    )

    const configArtifacts = await getConfigArtifacts(userConfig.contracts)

    // Validate top level config, contracts, and post-deployment actions.
    assertValidUserConfig(userConfig, cre, FailureAction.THROW)

    const managerAddress = getSphinxManagerAddress(
      ownerAddress,
      userConfig.projectName
    )

    const network = Object.entries(SUPPORTED_NETWORKS).find(
      (entry) => entry[1] === parseInt(chainId, 10)
    )
    if (!network) {
      throw new ValidationError(
        `Network with ID ${chainId} is not supported by Sphinx: ${JSON.stringify(
          network,
          null,
          2
        )}.`
      )
    }

    const { resolvedUserConfig, contractAddresses } = resolveContractReferences(
      userConfig,
      managerAddress
    )

    const contractConfigs = getUnvalidatedContractConfigs(
      resolvedUserConfig,
      [network[0]],
      configArtifacts,
      contractAddresses,
      cre,
      FailureAction.THROW
    )

    if (resolvedUserConfig.postDeploy) {
      assertValidPostDeploymentActions(
        resolvedUserConfig.postDeploy,
        contractConfigs,
        FailureAction.THROW,
        cre
      )
    }

    const postDeployActions = resolvedUserConfig.postDeploy
      ? parsePostDeploymentActions(
          resolvedUserConfig.postDeploy,
          contractConfigs,
          [network[0]],
          configArtifacts,
          cre,
          FailureAction.THROW
        )
      : {}

    const parsedConfig = {
      manager: managerAddress,
      contracts: contractConfigs,
      projectName: resolvedUserConfig.projectName,
      postDeploy: postDeployActions,
    }

    const minimalConfig = getFoundryConfig(parsedConfig, chainId, ownerAddress)

    const minimalConfigType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'minimalConfig'
    ).outputs[0]

    const coder = AbiCoder.defaultAbiCoder()
    const encodedConfigs = coder.encode(
      [minimalConfigType, 'string'],
      [minimalConfig, JSON.stringify(parsedConfig)]
    )

    const encodedSuccess = concat([
      encodedConfigs,
      coder.encode(['bool'], [true]), // true = success
    ])

    process.stdout.write(encodedSuccess)
  } catch (err) {
    const encodedFailure = getEncodedFailure(err)
    process.stdout.write(encodedFailure)
  }
})()
