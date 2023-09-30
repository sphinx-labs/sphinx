import { yellow, green, blue, bold } from 'chalk'

import { DecodedAction, ParsedConfig } from './config/types'
import {
  arraysEqual,
  getNetworkNameForChainId,
  getNetworkTag,
  hyperlink,
  prettyFunctionCall,
} from './utils'

export type SphinxDiff = Array<{
  networkTags: Array<string>
  executing: Array<DecodedAction>
  skipping: Array<DecodedAction>
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
        const { referenceName, functionName, variables } = signature

        const functionCallStr = prettyFunctionCall(
          referenceName,
          functionName,
          variables,
          5,
          3
        )

        let executingStr: string
        if (referenceName === 'SphinxManager') {
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
        const { referenceName, functionName, variables } = signature

        const functionCallStr = prettyFunctionCall(
          referenceName,
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

// TODO(refactor): c/f if (!isSupportedChainId(chainId)

export const getDiff = (parsedConfigs: Array<ParsedConfig>): SphinxDiff => {
  const networks: {
    [networkTag: string]: {
      executing: Array<DecodedAction>
      skipping: Array<DecodedAction>
    }
  } = {}

  for (const parsedConfig of parsedConfigs) {
    const executing: Array<DecodedAction> = []
    const skipping: Array<DecodedAction> = []

    const { chainId, initialState, actionInputs, isLiveNetwork } = parsedConfig

    if (!initialState.isManagerDeployed) {
      executing.push({
        referenceName: 'SphinxManager',
        functionName: 'constructor',
        variables: {},
      })
    }

    for (const action of actionInputs) {
      const { decodedAction, skip } = action

      if (skip) {
        skipping.push(decodedAction)
      } else {
        executing.push(decodedAction)
      }
    }

    const networkName = getNetworkNameForChainId(chainId)
    const networkTag = getNetworkTag(networkName, isLiveNetwork, chainId)

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
