import path, { resolve } from 'path'
import fs from 'fs'

import {
  getUnvalidatedParsedProjectConfig,
  projectPostParsingValidation,
} from '@chugsplash/core/dist/config/parse'
import { FailureAction } from '@chugsplash/core/dist/types'
import { getBundleInfo } from '@chugsplash/core/dist/tasks'
import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'
import { remove0x } from '@eth-optimism/core-utils/dist/common/hex-strings'
import {
  UserChugSplashConfig,
  writeCanonicalConfig,
} from '@chugsplash/core/dist'

import { createChugSplashRuntime } from '../cre'
import { getFoundryConfigOptions } from './options'
import { decodeCachedConfig } from './structs'
import { makeGetConfigArtifacts } from './utils'
import {
  getDeployContractCosts,
  getEncodedFailure,
  getPrettyWarnings,
  validationStderrWrite,
} from './logs'

const args = process.argv.slice(2)
const encodedConfigCache = args[0]
const userConfigStr = args[1]
const userConfig: UserChugSplashConfig = JSON.parse(userConfigStr)
const broadcasting = args[2] === 'true'
const projectName = args[3]

;(async () => {
  process.stderr.write = validationStderrWrite

  try {
    const {
      artifactFolder,
      buildInfoFolder,
      canonicalConfigFolder,
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
      process.env.DEV_FILE_PATH ?? './node_modules/@chugsplash/plugins/'
    const utilsArtifactFolder = `${rootImportPath}out/artifacts`

    const ChugSplashUtilsABI =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(resolve(
        `${utilsArtifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`
      )).abi

    const configCache = decodeCachedConfig(
      encodedConfigCache,
      ChugSplashUtilsABI
    )

    const cre = await createChugSplashRuntime(
      false,
      true,
      canonicalConfigFolder,
      undefined,
      false,
      process.stderr
    )

    const getConfigArtifacts = makeGetConfigArtifacts(
      artifactFolder,
      buildInfoFolder,
      cachePath
    )

    const projectConfigArtifacts = await getConfigArtifacts[projectName](
      userConfig.projects[projectName].contracts
    )

    const parsedProjectConfig = getUnvalidatedParsedProjectConfig(
      userConfig.projects[projectName],
      projectName,
      projectConfigArtifacts,
      cre,
      FailureAction.THROW,
      userConfig.options.owner
    )

    await projectPostParsingValidation(
      parsedProjectConfig,
      projectConfigArtifacts,
      projectName,
      cre,
      configCache,
      FailureAction.THROW
    )

    const { configUri, bundles, canonicalConfig } = await getBundleInfo(
      parsedProjectConfig,
      projectConfigArtifacts,
      configCache
    )

    if (broadcasting) {
      writeCanonicalConfig(canonicalConfigFolder, configUri, canonicalConfig)

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
        JSON.stringify(projectConfigArtifacts, null, 2)
      )
    }

    const actionBundleType = ChugSplashUtilsABI.find(
      (fragment) => fragment.name === 'actionBundle'
    ).outputs[0]
    const targetBundleType = ChugSplashUtilsABI.find(
      (fragment) => fragment.name === 'targetBundle'
    ).outputs[0]
    const deployContractCostsType = ChugSplashUtilsABI.find(
      (fragment) => fragment.name === 'deployContractCosts'
    ).outputs[0]

    const encodedActionBundle = defaultAbiCoder.encode(
      [actionBundleType],
      [bundles.actionBundle]
    )
    const encodedTargetBundle = defaultAbiCoder.encode(
      [targetBundleType],
      [bundles.targetBundle]
    )

    const deployContractCosts = getDeployContractCosts(projectConfigArtifacts)
    const encodedConfigUriAndWarnings = defaultAbiCoder.encode(
      ['string', deployContractCostsType, 'string'],
      [configUri, deployContractCosts, getPrettyWarnings()]
    )

    // This is where the encoded action bundle ends and the target bundle begins.
    const splitIdx1 = remove0x(encodedActionBundle).length / 2

    // This is where the target bundle ends and the rest of the bundle info (config URI, warnings,
    // etc) begins.
    const splitIdx2 = splitIdx1 + remove0x(encodedTargetBundle).length / 2

    const encodedSplitIdxs = defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [splitIdx1, splitIdx2]
    )

    const encodedSuccess = hexConcat([
      encodedActionBundle,
      encodedTargetBundle,
      encodedConfigUriAndWarnings,
      encodedSplitIdxs,
      defaultAbiCoder.encode(['bool'], [true]), // true = success
    ])

    process.stdout.write(encodedSuccess)
  } catch (err) {
    const encodedFailure = getEncodedFailure(err)
    process.stdout.write(encodedFailure)
  }
})()
