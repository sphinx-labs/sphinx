import { yellow, green, blue } from 'chalk'
import { BigNumber, utils } from 'ethers/lib/ethers'

import {
  ConfigArtifacts,
  ConfigCache,
  ContractConfigCache,
  ParsedContractConfig,
  ParsedContractConfigs,
} from './config/types'
import {
  arraysEqual,
  getCreationCodeWithConstructorArgs,
  hyperlink,
} from './utils'

type ContractAction = 'deploying' | 'skippingIdentical' | 'skippingModified'
const contractActions: Array<ContractAction> = [
  'deploying',
  'skippingIdentical',
  'skippingModified',
]

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
    skippingIdentical: [],
    skippingModified: [],
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

  // Create the diff string for the contracts that will be skipped because there is already a
  // contract at their Create3 address with identical creation code.
  const skippingIdenticalHeader = yellow.bold.underline(
    `Skipping (identical):\n`
  )
  const skippingIdenticalReason =
    yellow(`Reason: Contract with `) +
    yellow.underline('identical') +
    yellow(` creation code already deployed at the Create3 address.`)
  const skippingIdenticalString = getSkippingString(
    diffObject['skippingIdentical'],
    skippingIdenticalHeader,
    skippingIdenticalReason
  )

  // Create the diff string for the contracts that will be skipped because there is already a
  // contract at their Create3 address with different creation code.
  const skippingModifiedHeader = yellow.bold.underline(`Skipping (modified):\n`)
  const skippingModifiedReason =
    yellow(`Reason: Contract with `) +
    yellow.underline('different') +
    yellow(` creation code already deployed at the Create3 address.\n`)
  const skippingModifiedString = getSkippingString(
    diffObject['skippingModified'],
    skippingModifiedHeader,
    skippingModifiedReason
  )

  return (
    `\n${deployingString}${skippingIdenticalString}${skippingModifiedString}` +
    `Confirm? [y/n]`
  )
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

export const getDiff = (
  contractConfigs: ParsedContractConfigs,
  configCache: ConfigCache,
  configArtifacts: ConfigArtifacts
): SphinxDiff => {
  const { contractConfigCache } = configCache

  const deploying: Array<string> = []
  if (!configCache.isManagerDeployed) {
    deploying.push('SphinxManager')
  }

  const skippingIdentical: Array<string> = []
  const skippingModified: Array<string> = []
  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    const { isTargetDeployed } = contractConfigCache[referenceName]
    if (!isTargetDeployed) {
      deploying.push(referenceName)
    } else if (
      initCodeHashMatches(
        referenceName,
        contractConfig,
        configArtifacts,
        contractConfigCache
      )
    ) {
      skippingIdentical.push(referenceName)
    } else {
      skippingModified.push(referenceName)
    }
  }

  return {
    deploying,
    skippingIdentical,
    skippingModified,
  }
}

export const initCodeHashMatches = (
  referenceName: string,
  contractConfig: ParsedContractConfig,
  configArtifacts: ConfigArtifacts,
  contractConfigCache: ContractConfigCache
): boolean => {
  const { isTargetDeployed, deployedCreationCodeWithArgsHash } =
    contractConfigCache[referenceName]

  if (!isTargetDeployed || !deployedCreationCodeWithArgsHash) {
    return false
  }

  const { bytecode, abi } = configArtifacts[referenceName].artifact

  const currHash = utils.keccak256(
    getCreationCodeWithConstructorArgs(
      bytecode,
      contractConfig.constructorArgs,
      abi
    )
  )

  return BigNumber.from(deployedCreationCodeWithArgsHash).eq(
    BigNumber.from(currHash)
  )
}
