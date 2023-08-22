import path, { resolve } from 'path'
import fs from 'fs'

import {
  ValidationError,
  getUnvalidatedContractConfigs,
  postParsingValidation,
} from '@sphinx-labs/core/dist/config/parse'
import { FailureAction } from '@sphinx-labs/core/dist/types'
import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  UserSphinxConfig,
  getSphinxManagerAddress,
  getDeployContractCosts,
  writeCompilerConfig,
  remove0x,
  SUPPORTED_NETWORKS,
} from '@sphinx-labs/core/dist'
import { AbiCoder, concat } from 'ethers'

import { createSphinxRuntime } from '../cre'
import { getFoundryConfigOptions } from './options'
import { decodeCachedConfig } from './structs'
import { makeGetConfigArtifacts } from './utils'
import {
  getEncodedFailure,
  getPrettyWarnings,
  validationStderrWrite,
} from './logs'

const args = process.argv.slice(2)
const encodedConfigCache = args[0]
const userConfigStr = args[1]
const userConfig: UserSphinxConfig = JSON.parse(userConfigStr)
const broadcasting = args[2] === 'true'
const ownerAddress = args[3]

// This function must not rely on a provider object being available because a provider doesn't exist
// outside of Solidity for the in-process Anvil node.
;(async () => {
  process.stderr.write = validationStderrWrite

  try {
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

    const configCache = decodeCachedConfig(encodedConfigCache, SphinxUtilsABI)

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

    const managerAddress = getSphinxManagerAddress(
      ownerAddress,
      userConfig.projectName
    )

    const network = Object.entries(SUPPORTED_NETWORKS).find(
      (entry) => entry[1] === configCache.chainId
    )
    if (!network) {
      throw new ValidationError(
        `Network with ID ${
          configCache.chainId
        } is not supported by Sphinx: ${JSON.stringify(network, null, 2)}.`
      )
    }

    const contractConfigs = getUnvalidatedContractConfigs(
      userConfig,
      [network[0]],
      configArtifacts,
      cre,
      FailureAction.THROW,
      managerAddress
    )

    const parsedConfig = {
      manager: managerAddress,
      contracts: contractConfigs,
      projectName: userConfig.projectName,
    }

    await postParsingValidation(
      parsedConfig,
      configArtifacts,
      cre,
      configCache,
      FailureAction.THROW
    )

    const { configUri, bundles, compilerConfig } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts,
      configCache
    )

    if (broadcasting) {
      writeCompilerConfig(compilerConfigFolder, configUri, compilerConfig)

      const ipfsHash = configUri.replace('ipfs://', '')
      const artifactCachePath = path.resolve(`${cachePath}/configArtifacts`)
      // Create the canonical config network folder if it doesn't already exist.
      if (!fs.existsSync(artifactCachePath)) {
        fs.mkdirSync(artifactCachePath)
      }

      // Write the config artifacts to the local file system. It will exist in a JSON file that has the
      // config URI as its name.
      fs.writeFileSync(
        path.join(artifactCachePath, `${ipfsHash}.json`),
        JSON.stringify(configArtifacts, null, 2)
      )
    }

    const actionBundleType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'actionBundle'
    ).outputs[0]
    const targetBundleType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'targetBundle'
    ).outputs[0]
    const deployContractCostsType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'deployContractCosts'
    ).outputs[0]

    const coder = AbiCoder.defaultAbiCoder()
    const encodedActionBundle = coder.encode(
      [actionBundleType],
      [bundles.actionBundle]
    )
    const encodedTargetBundle = coder.encode(
      [targetBundleType],
      [bundles.targetBundle]
    )

    const deployContractCosts = getDeployContractCosts(configArtifacts)
    const encodedConfigUriAndWarnings = coder.encode(
      ['string', deployContractCostsType, 'string'],
      [configUri, deployContractCosts, getPrettyWarnings()]
    )

    // This is where the encoded action bundle ends and the target bundle begins.
    const splitIdx1 = remove0x(encodedActionBundle).length / 2

    // This is where the target bundle ends and the rest of the bundle info (config URI, warnings,
    // etc) begins.
    const splitIdx2 = splitIdx1 + remove0x(encodedTargetBundle).length / 2

    const encodedSplitIdxs = coder.encode(
      ['uint256', 'uint256'],
      [splitIdx1, splitIdx2]
    )

    const encodedSuccess = concat([
      encodedActionBundle,
      encodedTargetBundle,
      encodedConfigUriAndWarnings,
      encodedSplitIdxs,
      coder.encode(['bool'], [true]), // true = success
    ])

    process.stdout.write(encodedSuccess)
  } catch (err) {
    const encodedFailure = getEncodedFailure(err)
    process.stdout.write(encodedFailure)
  }
})()
