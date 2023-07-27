import { yellow, green, blue } from 'chalk'

import { ConfigCache } from './config/types'
import { arraysEqual, hyperlink } from './utils'

type ContractAction = 'deploying' | 'skipping'
const contractActions: Array<ContractAction> = ['deploying', 'skipping']

export type SphinxDiff = Record<ContractAction, Array<string>>

/**
 * @notice Returns a string that describes the changes that will be made to a set of contracts.
 */
export const getDiffString = (diffs: {
  [networkName: string]: SphinxDiff
}): string => {
  // Get an array of objects, where each object is a (referenceName, networkName, contractAction)
  // tuple.
  const diffTuples: Array<{
    referenceName: string
    networkName: string
    contractAction: string
  }> = []
  for (const [networkName, diff] of Object.entries(diffs)) {
    for (const [contractAction, referenceNames] of Object.entries(diff)) {
      for (const referenceName of referenceNames) {
        diffTuples.push({ referenceName, networkName, contractAction })
      }
    }
  }

  // Transform the diff objects into a format that is easier to print.
  const diffObject: Record<
    ContractAction,
    Array<{
      referenceNames: Array<string>
      networkNames: Array<string>
    }>
  > = {
    deploying: [],
    skipping: [],
  }
  for (const contractAction of contractActions) {
    const actions = diffObject[contractAction]

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
        .map((e) => e.networkName)
        .sort()

      // Check if an object already exists in the actions array that has the same network names. If
      // so, add this reference name to the existing object. Otherwise, create a new object.
      const existingAction = actions.find((e) =>
        arraysEqual(e.networkNames, networks)
      )

      if (existingAction) {
        existingAction.referenceNames.push(referenceName)
      } else {
        actions.push({
          referenceNames: [referenceName],
          networkNames: networks,
        })
      }
    }
  }

  // Create the diff string for the contracts that will be deployed.
  let deployingString: string = ''
  const deploying = diffObject['deploying']
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

      const networkNames: Array<string> = []
      if (e.networkNames.length === 1) {
        networkNames.push(green.bold(`Network:`))
        networkNames.push(green(e.networkNames[0]))
      } else {
        networkNames.push(green.bold(`Networks:`))
        const networks = e.networkNames.map((name, i) =>
          green(`${i + 1}. ${name}`)
        )
        networkNames.push(...networks)
      }
      const networkNamesString = `${networkNames.join('\n')}\n\n`

      deployingString += `${referenceNamesString}${networkNamesString}`
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
    diffObject['skipping'],
    skippingHeader,
    skippingReason
  )

  return `\n${deployingString}${skippingString}` + `Confirm? [y/n]`
}

const getSkippingString = (
  skipping: Array<{
    referenceNames: Array<string>
    networkNames: Array<string>
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

      const networkNames: Array<string> = []
      if (e.networkNames.length === 1) {
        networkNames.push(yellow.bold(`Network:`))
        networkNames.push(yellow(e.networkNames[0]))
      } else {
        networkNames.push(yellow.bold(`Networks:`))
        const networks = e.networkNames.map((name, i) =>
          yellow(`${i + 1}. ${name}`)
        )
        networkNames.push(...networks)
      }
      const networkNamesString = `${networkNames.join('\n')}\n\n`

      skippingString += `${referenceNamesString}${networkNamesString}`
    }
  }
  return skippingString
}

export const getDiff = (configCache: ConfigCache): SphinxDiff => {
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

  return {
    deploying,
    skipping,
  }
}
