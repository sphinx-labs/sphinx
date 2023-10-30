import { yellow, green, blue, bold } from 'chalk'

// TODO: the preview should mention if there are any create or create2 actions that won't be
// verified on etherscan.

import { DecodedAction, ParsedConfig } from './config/types'
import {
  arraysEqual,
  getNetworkNameForChainId,
  getNetworkTag,
  hyperlink,
  isRawFunctionCallActionInput,
  prettyFunctionCall,
  prettyRawFunctionCall,
} from './utils'

type PreviewElement = DecodedAction | { to: string; data: string }

export type SphinxPreview = Array<{
  networkTags: Array<string>
  executing: Array<PreviewElement>
  skipping: Array<PreviewElement>
}>

export const isDecodedAction = (
  element: PreviewElement
): element is DecodedAction =>
  (element as DecodedAction).referenceName !== undefined &&
  (element as DecodedAction).functionName !== undefined &&
  (element as DecodedAction).variables !== undefined

/**
 * @notice Returns a string that describes the changes that will be made to a set of contracts.
 */
export const getPreviewString = (
  preview: SphinxPreview,
  includeConfirmQuestion: boolean
): string => {
  let previewString = ''

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

  for (const { networkTags, executing, skipping } of preview) {
    // Get the preview string for the networks.
    const networkTagsArray: Array<string> = []
    if (networkTags.length === 1) {
      networkTagsArray.push(`${bold(`Network:`)} ${networkTags[0]}`)
    } else {
      networkTagsArray.push(bold.underline(`Networks:`))
      const networks = networkTags.map((tag, i) => `${i + 1}. ${tag}`)
      networkTagsArray.push(...networks)
    }
    previewString += `${networkTagsArray.join('\n')}\n`

    // Get the preview string for the actions that will be executed.
    const executingArray: Array<string> = []
    if (executing.length === 0) {
      executingArray.push(green.underline.bold(`Nothing to execute.`))
    } else {
      executingArray.push(green.underline.bold(`Executing:`))
      for (let i = 0; i < executing.length; i++) {
        const element = executing[i]

        if (isDecodedAction(element)) {
          const { referenceName, functionName, variables } = element
          const actionStr = prettyFunctionCall(
            referenceName,
            functionName,
            variables,
            5,
            3
          )

          let executingStr: string
          if (referenceName === 'SphinxManager') {
            executingStr =
              green(`${i + 1}. ${actionStr}`) +
              ` ${green('(see')} ${blue(sphinxManagerLink)} ${green(
                'for more info)'
              )}`
          } else {
            executingStr = green(`${i + 1}. ${actionStr}`)
          }
          executingArray.push(executingStr)
        } else {
          const { to, data } = element
          const actionStr = prettyRawFunctionCall(to, data)
          executingArray.push(green(`${i + 1}. ${actionStr}`))
        }
      }
    }
    previewString += `${executingArray.join('\n')}\n`

    // Get the preview string for the actions that will be skipped.
    if (skipping.length > 0) {
      const skippingArray: Array<string> = []
      skippingArray.push(yellow.underline.bold(`Skipping:`))
      skippingArray.push(skippingReason)
      for (let i = 0; i < skipping.length; i++) {
        const element = skipping[i]
        const functionCallStr = isDecodedAction(element)
          ? prettyFunctionCall(
              element.referenceName,
              element.functionName,
              element.variables,
              5,
              3
            )
          : prettyRawFunctionCall(element.to, element.data)

        const skippingStr = yellow(`${i + 1}. ${functionCallStr}`)
        skippingArray.push(skippingStr)
      }
      previewString += `${skippingArray.join('\n')}\n`
    }

    previewString += '\n'
  }

  if (includeConfirmQuestion) {
    previewString += `Confirm? [y/n]`
  }
  return previewString
}

export const getPreview = (
  parsedConfigs: Array<ParsedConfig>
): SphinxPreview => {
  // TODO: Remove this when you update the preview. I put it here temporarily to prevent a type
  // error.
  parsedConfigs
  return {
    networkTags: [],
    executing: [],
    skipping: [],
  } as any

  // const networks: {
  //   [networkTag: string]: {
  //     executing: Array<PreviewElement>
  //     skipping: Array<PreviewElement>
  //   }
  // } = {}

  // for (const parsedConfig of parsedConfigs) {
  //   const executing: Array<PreviewElement> = []
  //   const skipping: Array<PreviewElement> = []

  //   const { chainId, initialState, actionInputs, isLiveNetwork } = parsedConfig

  //   if (!initialState.isManagerDeployed) {
  //     executing.push({
  //       referenceName: 'SphinxManager',
  //       functionName: 'constructor',
  //       variables: {},
  //     })
  //   }

  //   for (const action of actionInputs) {
  //     if (isRawFunctionCallActionInput(action)) {
  //       const { data, skip, to } = action

  //       if (skip) {
  //         skipping.push({ to, data })
  //       } else {
  //         executing.push({ to, data })
  //       }
  //     } else {
  //       const { decodedAction, skip } = action

  //       if (skip) {
  //         skipping.push(decodedAction)
  //       } else {
  //         executing.push(decodedAction)
  //       }
  //     }
  //   }

  //   const networkName = getNetworkNameForChainId(BigInt(chainId))
  //   const networkTag = getNetworkTag(
  //     networkName,
  //     isLiveNetwork,
  //     BigInt(chainId)
  //   )

  //   networks[networkTag] = { executing, skipping }
  // }

  // // Next, we group networks that have the same executing and skipping arrays.
  // const preview: SphinxPreview = []
  // for (const [networkTag, { executing, skipping }] of Object.entries(
  //   networks
  // )) {
  //   const existingNetwork = preview.find(
  //     (e) =>
  //       arraysEqual(e.executing, executing) && arraysEqual(e.skipping, skipping)
  //   )

  //   if (existingNetwork) {
  //     existingNetwork.networkTags.push(networkTag)
  //   } else {
  //     preview.push({
  //       networkTags: [networkTag],
  //       executing,
  //       skipping,
  //     })
  //   }
  // }

  // return preview
}
