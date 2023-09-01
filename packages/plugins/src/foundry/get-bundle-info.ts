import path, { resolve } from 'path'
import fs from 'fs'

import { postParsingValidation } from '@sphinx-labs/core/dist/config/parse'
import { FailureAction } from '@sphinx-labs/core/dist/types'
import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  writeCompilerConfig,
  remove0x,
  ParsedConfig,
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
const parsedConfigStr = args[1]
const parsedConfig: ParsedConfig = JSON.parse(parsedConfigStr)
const broadcasting = args[2] === 'true'

// This function must not rely on a provider object being available because a provider doesn't exist
// outside of Solidity for the in-process Anvil node.
;(async () => {
  process.stderr.write = validationStderrWrite

  try {
    const { compilerConfigFolder, cachePath, artifactFolder, buildInfoFolder } =
      await getFoundryConfigOptions()

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

    const configArtifacts = await getConfigArtifacts(parsedConfig.contracts)

    await postParsingValidation(
      parsedConfig,
      configArtifacts,
      cre,
      configCache,
      FailureAction.THROW
    )

    const { configUri, bundles, compilerConfig, humanReadableActions } =
      await getProjectBundleInfo(parsedConfig, configArtifacts, configCache)

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

    const bundledActionType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'bundledActions'
    ).outputs[0]
    const targetBundleType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'targetBundle'
    ).outputs[0]
    const humanReadableActionsType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'humanReadableActions'
    ).outputs[0]

    const coder = AbiCoder.defaultAbiCoder()
    const encodedActionBundle = coder.encode(
      [bundledActionType],
      [bundles.actionBundle.actions]
    )
    const encodedTargetBundle = coder.encode(
      [targetBundleType],
      [bundles.targetBundle]
    )

    const encodedConfigUriAndWarnings = coder.encode(
      ['string', humanReadableActionsType, 'string'],
      [configUri, Object.values(humanReadableActions), getPrettyWarnings()]
    )

    // This is where the encoded action bundle ends and the target bundle begins. We add 32 because
    // the first 32 bytes are reserved for the action bundle's root.
    const splitIdx1 = 32 + remove0x(encodedActionBundle).length / 2

    // This is where the target bundle ends and the rest of the bundle info (config URI, warnings,
    // etc) begins.
    const splitIdx2 = splitIdx1 + remove0x(encodedTargetBundle).length / 2

    const encodedSplitIdxs = coder.encode(
      ['uint256', 'uint256'],
      [splitIdx1, splitIdx2]
    )

    const encodedSuccess = concat([
      bundles.actionBundle.root,
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
