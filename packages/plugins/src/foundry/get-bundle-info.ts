import {
  getUnvalidatedParsedConfig,
  postParsingValidation,
} from '@chugsplash/core/dist/config/parse'
import { FailureAction } from '@chugsplash/core/dist/types'
import { getBundleInfo } from '@chugsplash/core/dist/tasks'
import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'
import { remove0x } from '@eth-optimism/core-utils/dist/common/hex-strings'

import { createChugSplashRuntime } from '../cre'
import { getPaths } from './paths'
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
const userConfig = JSON.parse(userConfigStr)

;(async () => {
  process.stderr.write = validationStderrWrite

  try {
    const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
      await getPaths()

    const ChugSplashUtilsABI =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi

    const configCache = decodeCachedConfig(encodedConfigCache, artifactFolder)

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
      buildInfoFolder
    )

    const configArtifacts = await getConfigArtifacts(userConfig.contracts)

    const parsedConfig = getUnvalidatedParsedConfig(
      userConfig,
      configArtifacts,
      cre,
      FailureAction.THROW
    )

    await postParsingValidation(
      parsedConfig,
      configArtifacts,
      cre,
      configCache,
      FailureAction.THROW
    )

    const { configUri, bundles } = await getBundleInfo(
      parsedConfig,
      configArtifacts,
      configCache
    )

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

    const deployContractCosts = getDeployContractCosts(configArtifacts)
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
