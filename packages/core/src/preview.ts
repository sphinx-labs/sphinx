import { yellow, green, bold } from 'chalk'
import { CREATE3_PROXY_INITCODE, Operation } from '@sphinx-labs/contracts'

import {
  ActionInput,
  ActionInputType,
  DecodedAction,
  NetworkConfig,
} from './config/types'
import {
  arraysEqual,
  getNetworkTag,
  prettyFunctionCall,
  prettyRawFunctionCall,
} from './utils'
import { fetchNameForNetwork } from './networks'
import { InvariantError } from './errors'

type SystemDeploymentElement = {
  type: 'SystemDeployment'
}

type FundingSafeElement = {
  type: 'FundingSafe'
  value: string
}

type PreviewElement =
  | DecodedAction
  | { to: string; data: string; value: string }
  | SystemDeploymentElement
  | FundingSafeElement

/**
 * @property unlabeledAddresses A set of unlabeled addresses. The preview will warn the user that
 * these addresses will not be verified on Etherscan and they will not have a deployment artifact.
 * This set does not include any `CREATE3` proxies even though they're unlabeled. We exclude
 * `CREATE3` proxies because we assume that the user doesn't need a contract deployment artifact for
 * them, since users never interact directly with these proxies. Also, if a user isn't aware that
 * `CREATE3` involves a proxy deployment, they may reasonably be confused about a warning for a
 * contract they didn't know existed.
 */
export type SphinxPreview = {
  merkleRoot: string
  networks: Array<{
    networkTags: Array<string>
    executing: Array<PreviewElement>
    skipping: Array<PreviewElement>
    chainId: string
    safeAddress: string
  }>
  unlabeledAddresses: Set<string>
}

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

  const skippingReason = `${yellow.bold(`Reason:`)} ${yellow(
    `Already executed.`
  )}`

  for (const {
    networkTags,
    executing,
    skipping,
    chainId,
    safeAddress,
  } of preview.networks) {
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
          const { referenceName, functionName, variables, address, value } =
            element
          const actionStr = prettyFunctionCall(
            referenceName,
            address,
            functionName,
            variables,
            chainId,
            value,
            5,
            3
          )

          executingArray.push(green(`${i + 1}. ${actionStr}`))
        } else if (isSystemDeploymentElement(element)) {
          executingArray.push(green(`${i + 1}. Sphinx & Gnosis Safe Contracts`))
        } else if (isFundingSafeElement(element)) {
          const actionStr = prettyFunctionCall(
            'GnosisSafe',
            safeAddress,
            'call',
            {},
            chainId,
            element.value,
            5,
            3
          )
          executingArray.push(green(`${i + 1}. ${actionStr}`))
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
        let functionCallStr: string
        if (isDecodedAction(element)) {
          functionCallStr = prettyFunctionCall(
            element.referenceName,
            element.address,
            element.functionName,
            element.variables,
            chainId,
            element.value,
            5,
            3
          )
        } else if (isSystemDeploymentElement(element)) {
          throw new Error(
            `Skipped preview elements contain the Sphinx system contracts. Should never happen.`
          )
        } else if (isFundingSafeElement(element)) {
          throw new InvariantError(
            `Skipped preview elements contain a Safe funding element`
          )
        } else {
          functionCallStr = prettyRawFunctionCall(element.to, element.data)
        }

        const skippingStr = yellow(`${i + 1}. ${functionCallStr}`)
        skippingArray.push(skippingStr)
      }
      previewString += `${skippingArray.join('\n')}\n`
    }

    previewString += '\n'
  }

  // Warn about unlabeled addresses
  if (preview.unlabeledAddresses.size > 0) {
    previewString += `${yellow.bold(
      `Warning: Sphinx couldn't find a contract artifact for the following addresses:\n`
    )}`
    previewString += `${Array.from(preview.unlabeledAddresses)
      .map((e) => yellow(`- ${e}`))
      .join('\n')}\n`
    previewString += yellow(
      `This typically happens when deploying contracts using hardcoded bytecode and no \n` +
        `associated source file. Sphinx will not create a deployment artifact or attempt \n` +
        `Etherscan verification for any address in the list above.\n\n` +
        `If you think this is a mistake, try running "forge build --force", then run your Sphinx command again.\n`
    )
  }

  previewString += `Merkle Root: ${preview.merkleRoot}\n\n`

  if (includeConfirmQuestion) {
    previewString += `Confirm? [y/n]`
  }
  return previewString
}

const assertIsFundingCheckAction = (
  fundingCheck: ActionInput | undefined,
  fundingRequest: {
    fundsRequested: string
    startingBalance: string
  },
  safeAddress: string
) => {
  const expectedCheckValue = (
    BigInt(fundingRequest.fundsRequested) +
    BigInt(fundingRequest.startingBalance)
  ).toString()

  if (
    !fundingCheck ||
    fundingCheck.txData !== '0x' ||
    fundingCheck.value !== expectedCheckValue ||
    fundingCheck.to !== safeAddress ||
    fundingCheck.actionType !== ActionInputType.CALL ||
    fundingCheck.requireSuccess !== true ||
    fundingCheck.operation !== Operation.Call ||
    fundingCheck.contracts.length !== 0 ||
    fundingCheck.index !== '1' ||
    fundingCheck.decodedAction.address !== '' ||
    fundingCheck.decodedAction.functionName !== 'call' ||
    fundingCheck.decodedAction.referenceName !== safeAddress ||
    fundingCheck.decodedAction.value !== expectedCheckValue ||
    !Array.isArray(fundingCheck.decodedAction.variables) ||
    fundingCheck.decodedAction.variables?.length !== 1 ||
    fundingCheck.decodedAction.variables[0] !== '0x'
  ) {
    throw new InvariantError(
      'Expected to find Gnosis Safe funding checking action, but did not'
    )
  }
}

export const getPreview = (
  networkConfigs: Array<NetworkConfig>,
  merkleRoot: string
): SphinxPreview => {
  const networks: {
    [networkTag: string]: {
      executing: Array<PreviewElement>
      skipping: Array<PreviewElement>
      unlabeledAddresses: Array<string>
      chainId: string
      safeAddress: string
    }
  } = {}

  for (const networkConfig of networkConfigs) {
    const executing: Array<PreviewElement> = []
    const skipping: Array<PreviewElement> = []

    const {
      chainId,
      initialState,
      actionInputs,
      executionMode,
      unlabeledContracts,
      isSystemDeployed,
    } = networkConfig

    const unlabeledAddresses = unlabeledContracts
      // Remove the `CREATE3` proxies.
      .filter(
        (contract) => contract.initCodeWithArgs !== CREATE3_PROXY_INITCODE
      )
      .map((contract) => contract.address)

    const networkName = fetchNameForNetwork(BigInt(chainId))
    const networkTag = getNetworkTag(
      networkName,
      executionMode,
      BigInt(chainId)
    )

    // If there aren't any transactions to execute on the current network, we set the current
    // network's preview to be empty. This applies even if the Gnosis Safe and Sphinx Module haven't
    // been deployed yet because we don't currently allow the user to deploy the Safe and Module
    // without executing a deployment.
    if (actionInputs.length > 0) {
      if (!isSystemDeployed) {
        executing.push({
          type: 'SystemDeployment',
        })
      }
      if (!initialState.isSafeDeployed) {
        executing.push({
          referenceName: 'GnosisSafe',
          functionName: 'deploy',
          variables: {},
          address: networkConfig.safeAddress,
          value: '0',
        })
      }
      if (!initialState.isModuleDeployed) {
        executing.push({
          referenceName: 'SphinxModule',
          functionName: 'deploy',
          variables: {},
          address: networkConfig.moduleAddress,
          value: '0',
        })
      }

      for (let i = 0; i < actionInputs.length; i++) {
        /**
         * We do not display the Safe balance check action in the preview because we don't want to confuse
         * the user by showing an action that they don't understand without context on why it's there.
         *
         * If we find that users are having deployments fail due to this check, then we will reconsider if
         * we should provide more detail on this specific check.
         */
        if (
          i === 0 &&
          networkConfig.safeFundingRequest &&
          BigInt(networkConfig.safeFundingRequest.fundsRequested) > BigInt(0)
        ) {
          const [fundingCheck] = actionInputs
          assertIsFundingCheckAction(
            fundingCheck,
            networkConfig.safeFundingRequest,
            networkConfig.safeAddress
          )

          // Instead we use a special preview element to represent the Safe funding request
          executing.push({
            type: 'FundingSafe',
            value: networkConfig.safeFundingRequest.fundsRequested,
          })
        } else {
          const { decodedAction } = actionInputs[i]
          executing.push(decodedAction)
        }
      }
    }

    networks[networkTag] = {
      executing,
      skipping,
      unlabeledAddresses,
      chainId: networkConfig.chainId,
      safeAddress: networkConfig.safeAddress,
    }
  }

  // Next, we group networks that have the same executing and skipping arrays.
  const preview: SphinxPreview = {
    networks: [],
    unlabeledAddresses: new Set([]),
    merkleRoot,
  }
  for (const [
    networkTag,
    { executing, skipping, unlabeledAddresses, chainId, safeAddress },
  ] of Object.entries(networks)) {
    const existingNetwork = preview.networks.find(
      (e) =>
        arraysEqual(e.executing, executing) && arraysEqual(e.skipping, skipping)
    )

    for (const address of unlabeledAddresses) {
      preview.unlabeledAddresses.add(address)
    }

    if (existingNetwork) {
      existingNetwork.networkTags.push(networkTag)
    } else {
      preview.networks.push({
        networkTags: [networkTag],
        executing,
        skipping,
        chainId,
        safeAddress,
      })
    }
  }

  return preview
}

const isSystemDeploymentElement = (
  element: PreviewElement
): element is SystemDeploymentElement => {
  return (element as SystemDeploymentElement).type === 'SystemDeployment'
}

const isFundingSafeElement = (
  element: PreviewElement
): element is FundingSafeElement => {
  return (element as FundingSafeElement).type === 'FundingSafe'
}
