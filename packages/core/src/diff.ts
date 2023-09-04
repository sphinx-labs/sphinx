import { yellow, green, blue, bold } from 'chalk'

import {
  ConfigCache,
  ParsedConfig,
  SphinxFunctionSignature,
} from './config/types'
import {
  arraysEqual,
  getNetworkTag,
  hyperlink,
  isSupportedChainId,
  prettyFunctionCall,
  skipCallAction,
} from './utils'

export type SphinxDiff = Array<{
  networkTags: Array<string>
  executing: Array<SphinxFunctionSignature>
  skipping: Array<SphinxFunctionSignature>
}>

/**
 * @notice Returns a string that describes the changes that will be made to a set of contracts.
 */
export const getDiffString = (diff: SphinxDiff): string => {
  let diffString = ''

  const sphinxManagerLink = hyperlink(
    'here',
    'https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md'
  )
  const skippingLink = hyperlink(
    'here',
    'https://github.com/sphinx-labs/sphinx/blob/develop/docs/faq.md#why-is-sphinx-skipping-a-contract-deployment-or-function-call'
  )
  const skippingReason = `${yellow.bold(`Reason:`)} ${yellow(
    `Already executed. See`
  )} ${blue(skippingLink)} ${yellow('for more info.')}`

  for (const { networkTags, executing, skipping } of diff) {
    // Get the diff string for the networks.
    const networkTagsArray: Array<string> = []
    if (networkTags.length === 1) {
      networkTagsArray.push(`${bold(`Network:`)} ${networkTags[0]}`)
    } else {
      networkTagsArray.push(bold.underline(`Networks:`))
      const networks = networkTags.map((tag, i) => `${i + 1}. ${tag}`)
      networkTagsArray.push(...networks)
    }
    diffString += `${networkTagsArray.join('\n')}\n`

    // Get the diff string for the actions that will be executed.
    const executingArray: Array<string> = []
    if (executing.length === 0) {
      executingArray.push(green.underline.bold(`Nothing to execute.`))
    } else {
      executingArray.push(green.underline.bold(`Executing:`))
      for (let i = 0; i < executing.length; i++) {
        const signature = executing[i]
        const { referenceNameOrAddress, functionName, variables } = signature

        const functionCallStr = prettyFunctionCall(
          referenceNameOrAddress,
          functionName,
          variables,
          5,
          3
        )

        let executingStr: string
        if (referenceNameOrAddress === 'SphinxManager') {
          executingStr =
            green(`${i + 1}. ${functionCallStr}`) +
            ` ${green('(see')} ${blue(sphinxManagerLink)} ${green(
              'for more info)'
            )}`
        } else {
          executingStr = green(`${i + 1}. ${functionCallStr}`)
        }

        executingArray.push(executingStr)
      }
    }
    diffString += `${executingArray.join('\n')}\n`

    // Get the diff string for the actions that will be skipped.
    if (skipping.length > 0) {
      const skippingArray: Array<string> = []
      skippingArray.push(yellow.underline.bold(`Skipping:`))
      skippingArray.push(skippingReason)
      for (let i = 0; i < skipping.length; i++) {
        const signature = skipping[i]
        const { referenceNameOrAddress, functionName, variables } = signature

        const functionCallStr = prettyFunctionCall(
          referenceNameOrAddress,
          functionName,
          variables,
          5,
          3
        )

        const skippingStr = yellow(`${i + 1}. ${functionCallStr}`)
        skippingArray.push(skippingStr)
      }
      diffString += `${skippingArray.join('\n')}\n`
    }

    diffString += '\n'
  }

  return diffString + `Confirm? [y/n]`
}

export const getDiff = (
  parsedConfig: ParsedConfig,
  configCaches: Array<ConfigCache>
): SphinxDiff => {
  const networks: {
    [networkTag: string]: {
      executing: Array<SphinxFunctionSignature>
      skipping: Array<SphinxFunctionSignature>
    }
  } = {}

  for (const configCache of configCaches) {
    const executing: Array<SphinxFunctionSignature> = []
    const skipping: Array<SphinxFunctionSignature> = []

    const chainId = configCache.chainId

    // Narrows the TypeScript type of `chainId` to `SupportedChainId`.
    if (!isSupportedChainId(chainId)) {
      // An unsupported chain ID should have been caught in the parsing logic.
      throw new Error(`Unsupported chain ID: ${chainId}. Should never happen.`)
    }

    if (!configCache.isManagerDeployed) {
      executing.push({
        referenceNameOrAddress: 'SphinxManager',
        functionName: 'constructor',
        variables: {},
      })
    }

    for (const [referenceName, contractConfig] of Object.entries(
      parsedConfig.contracts
    )) {
      const constructorArgs = contractConfig.constructorArgs[chainId] ?? {}

      const constructorSignature: SphinxFunctionSignature = {
        referenceNameOrAddress: referenceName,
        functionName: 'constructor',
        variables: constructorArgs,
      }

      if (configCache.contractConfigCache[referenceName].isTargetDeployed) {
        skipping.push(constructorSignature)
      } else {
        executing.push(constructorSignature)
      }
    }

    const postDeploy = parsedConfig.postDeploy[chainId] ?? []
    for (const { to, data, nonce, readableSignature } of postDeploy) {
      if (skipCallAction(to, data, nonce, configCache.callNonces)) {
        skipping.push(readableSignature)
      } else {
        executing.push(readableSignature)
      }
    }

    const networkTag = getNetworkTag(
      configCache.networkName,
      configCache.networkType,
      configCache.chainId
    )

    networks[networkTag] = { executing, skipping }
  }

  // Next, we group networks that have the same executing and skipping arrays.
  const diff: SphinxDiff = []
  for (const [networkTag, { executing, skipping }] of Object.entries(
    networks
  )) {
    const existingNetwork = diff.find(
      (e) =>
        arraysEqual(e.executing, executing) && arraysEqual(e.skipping, skipping)
    )

    if (existingNetwork) {
      existingNetwork.networkTags.push(networkTag)
    } else {
      diff.push({
        networkTags: [networkTag],
        executing,
        skipping,
      })
    }
  }

  return diff
}
