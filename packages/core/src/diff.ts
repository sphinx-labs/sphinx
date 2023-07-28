import { yellow, green, blue } from 'chalk'

import { ConfigCache } from './config/types'
import { arraysEqual, getNetworkTag, hyperlink } from './utils'

type ContractAction = 'deploying' | 'skipping'
const contractActionTypes: Array<ContractAction> = ['deploying', 'skipping']

export type SphinxDiff = Record<
  ContractAction,
  Array<{
    referenceNames: Array<string>
    networkTags: Array<string>
  }>
>

/**
 * @notice Returns a string that describes the changes that will be made to a set of contracts.
 */
export const getDiffString = (diff: SphinxDiff): string => {
  // Create the diff string for the contracts that will be deployed.
  let deployingString: string = ''
  const deploying = diff['deploying']
  if (deploying.length === 0) {
    deployingString = green(`No new contracts to deploy.\n\n`)
  } else {
    deployingString += green.underline.bold(`Deploying:`)
    for (const e of deploying) {
      const referenceNames = e.referenceNames.map((name) => {
        if (name === 'SphinxManager') {
          const link = hyperlink(
            'here',
            'https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md'
          )
          return green(`+ ${name}`) + ` (see ${blue(link)} for more info)`
        }
        return green(`+ ${name}`)
      })
      const referenceNamesString = `\n${referenceNames.join('\n')}\n`

      const networkTags: Array<string> = []
      if (e.networkTags.length === 1) {
        networkTags.push(green.bold(`Network:`))
        networkTags.push(green(e.networkTags[0]))
      } else {
        networkTags.push(green.bold(`Networks:`))
        const networks = e.networkTags.map((name, i) =>
          green(`${i + 1}. ${name}`)
        )
        networkTags.push(...networks)
      }
      const networkTagsString = `${networkTags.join('\n')}\n\n`

      deployingString += `${referenceNamesString}${networkTagsString}`
    }
  }

  // Create the diff string for the contracts that will be skipped.
  const skippingHeader = yellow.bold.underline(`Skipping:\n`)
  const skippingReason = yellow(
    `Reason: Contract already deployed at the Create3 address. To deploy instead of skipping, see instructions ${hyperlink(
      'here',
      'https://github.com/sphinx-labs/sphinx/blob/develop/docs/faq.md#how-do-i-deploy-a-contract-when-another-contract-already-exists-at-its-create3-address'
    )}.`
  )
  const skippingString = getSkippingString(
    diff['skipping'],
    skippingHeader,
    skippingReason
  )

  return `\n${deployingString}${skippingString}` + `Confirm? [y/n]`
}

export const getDiff = (configCaches: Array<ConfigCache>): SphinxDiff => {
  const contractActions: {
    [networkTags: string]: {
      deploying: Array<string>
      skipping: Array<string>
    }
  } = {}
  for (const configCache of configCaches) {
    const deploying: Array<string> = []
    if (!configCache.isManagerDeployed) {
      deploying.push('SphinxManager')
    }

    const skipping: Array<string> = []
    for (const [referenceName, contractConfigCache] of Object.entries(
      configCache.contractConfigCache
    )) {
      const { isTargetDeployed } = contractConfigCache
      if (!isTargetDeployed) {
        deploying.push(referenceName)
      } else {
        skipping.push(referenceName)
      }
    }

    const networkTag = getNetworkTag(
      configCache.networkName,
      configCache.networkType,
      configCache.chainId
    )

    contractActions[networkTag] = { deploying, skipping }
  }

  // Get an array of objects, where each object is a (referenceName, networkTag, contractAction)
  // tuple.
  const diffTuples: Array<{
    referenceName: string
    networkTag: string
    contractAction: string
  }> = []
  for (const [networkTag, networkContractActions] of Object.entries(
    contractActions
  )) {
    for (const [contractAction, referenceNames] of Object.entries(
      networkContractActions
    )) {
      for (const referenceName of referenceNames) {
        diffTuples.push({ referenceName, networkTag, contractAction })
      }
    }
  }

  // Transform the diff objects into a format that is easier to print.
  const diff: Record<
    ContractAction,
    Array<{
      referenceNames: Array<string>
      networkTags: Array<string>
    }>
  > = {
    deploying: [],
    skipping: [],
  }
  for (const contractAction of contractActionTypes) {
    const actions = diff[contractAction]

    const filteredObjects = diffTuples.filter(
      (e) => e.contractAction === contractAction
    )

    // Get the list of unique reference names for this contract action
    const uniqueReferenceNames = Array.from(
      new Set(filteredObjects.map((e) => e.referenceName))
    )

    // Sort the reference names in alphabetical order
    uniqueReferenceNames.sort()

    for (const referenceName of uniqueReferenceNames) {
      // Get the list of networks that this reference name will be deployed to. Sort the networks in
      // alphabetical order.
      const networks = filteredObjects
        .filter((e) => e.referenceName === referenceName)
        .map((e) => e.networkTag)
        .sort()

      // Check if an object already exists in the actions array that has the same network tags. If
      // so, add this reference name to the existing object. Otherwise, create a new object.
      const existingAction = actions.find((e) =>
        arraysEqual(e.networkTags, networks)
      )

      if (existingAction) {
        existingAction.referenceNames.push(referenceName)
      } else {
        actions.push({
          referenceNames: [referenceName],
          networkTags: networks,
        })
      }
    }
  }
  return diff
}

const getSkippingString = (
  skipping: Array<{
    referenceNames: Array<string>
    networkTags: Array<string>
  }>,
  header: string,
  reason: string
): string => {
  let skippingString: string = ''
  if (skipping.length > 0) {
    skippingString += header
    skippingString += reason
    skippingString += yellow.bold(`\nContract(s):`)

    for (const e of skipping) {
      const referenceNames = e.referenceNames.map((name) => {
        return yellow(`~ ${name}`)
      })
      const referenceNamesString = `\n${referenceNames.join('\n')}\n`

      const networkTags: Array<string> = []
      if (e.networkTags.length === 1) {
        networkTags.push(yellow.bold(`Network:`))
        networkTags.push(yellow(e.networkTags[0]))
      } else {
        networkTags.push(yellow.bold(`Networks:`))
        const networks = e.networkTags.map((name, i) =>
          yellow(`${i + 1}. ${name}`)
        )
        networkTags.push(...networks)
      }
      const networkTagsString = `${networkTags.join('\n')}\n\n`

      skippingString += `${referenceNamesString}${networkTagsString}`
    }
  }
  return skippingString
}
