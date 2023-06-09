import {
  getUnvalidatedParsedConfig,
  postParsingValidation,
} from '@chugsplash/core/dist/config/parse'
import { FailureAction } from '@chugsplash/core/dist/types'
import { getBundleInfo } from '@chugsplash/core/dist/tasks'
import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'
import { remove0x } from '@eth-optimism/core-utils/dist/common/hex-strings'
import { ConfigArtifacts } from '@chugsplash/core/dist/config/types'
import { getEstDeployContractCost } from '@chugsplash/core/dist/utils'
import { BigNumber } from 'ethers/lib/ethers'

import { createChugSplashRuntime } from '../cre'
import { getPaths } from './paths'
import { decodeCachedConfig } from './structs'
import { makeGetConfigArtifacts } from './utils'

const args = process.argv.slice(2)
const encodedConfigCache = args[0]
const userConfigStr = args[1]
const userConfig = JSON.parse(userConfigStr)

type DeployContractCost = {
  referenceName: string
  cost: BigNumber
}

// These variables are used to capture any errors or warnings that occur during the ChugSplash
// config validation process.
let validationWarnings: string = ''
let validationErrors: string = ''
// This function overrides the default 'stderr.write' function to capture any errors or warnings
// that occur during the validation process.
const validationStderrWrite = (message: string) => {
  if (message.startsWith('\nWarning: ')) {
    validationWarnings += message.replace('\n', '')
  } else if (message.startsWith('\nError: ')) {
    // We remove '\nError: ' because Foundry already displays the word "Error" when an error occurs.
    validationErrors += message.replace('\nError: ', '')
  } else {
    validationErrors += message
  }
  return true
}

const getEncodedFailure = (err: Error): string => {
  // Trim a trailing '\n' character from the end of 'warnings' if it exists.
  const prettyWarnings = getPrettyWarnings()

  let prettyError: string
  if (err.name === 'ValidationError') {
    // We return the error messages and warnings.

    // Removes unnecessary '\n' characters from the end of 'errors'
    prettyError = validationErrors.endsWith('\n\n')
      ? validationErrors.substring(0, validationErrors.length - 2)
      : validationErrors
  } else {
    // A non-parsing error occurred. We return the error message and stack trace.
    prettyError = `${err.name}: ${err.message}\n\n${err.stack}`
  }

  const encodedErrorsAndWarnings = defaultAbiCoder.encode(
    ['string', 'string'],
    [prettyError, prettyWarnings]
  )

  const encodedFailure = hexConcat([
    encodedErrorsAndWarnings,
    defaultAbiCoder.encode(['bool'], [false]), // false = failure
  ])

  return encodedFailure
}

// Removes a '\n' character from the end of 'warnings' if it exists.
const getPrettyWarnings = (): string => {
  return validationWarnings.endsWith('\n\n')
    ? validationWarnings.substring(0, validationWarnings.length - 1)
    : validationWarnings
}

const getDeployContractCosts = (
  configArtifacts: ConfigArtifacts
): DeployContractCost[] => {
  const deployContractCosts: DeployContractCost[] = []
  for (const [referenceName, { artifact, buildInfo }] of Object.entries(
    configArtifacts
  )) {
    const { sourceName, contractName } = artifact

    const deployContractCost = getEstDeployContractCost(
      buildInfo.output.contracts[sourceName][contractName].evm.gasEstimates
    )

    deployContractCosts.push({
      referenceName,
      cost: deployContractCost,
    })
  }
  return deployContractCosts
}

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

    // TODO: see if parsing errors still work when thrown in this function

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

    // writeCanonicalConfig(canonicalConfigFolder, configUri, canonicalConfig)

    // const ipfsHash = configUri.replace('ipfs://', '')
    // const cachePath = path.resolve('./cache')
    // // Create the canonical config network folder if it doesn't already exist.
    // if (!fs.existsSync(cachePath)) {
    //   fs.mkdirSync(cachePath)
    // }

    // // Write the canonical config to the local file system. It will exist in a JSON file that has the
    // // config URI as its name.
    // fs.writeFileSync(
    //   path.join(cachePath, `${ipfsHash}.json`),
    //   JSON.stringify(configArtifacts, null, 2)
    // )

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
