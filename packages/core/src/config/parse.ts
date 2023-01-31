/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { ethers, providers } from 'ethers'
import { assertStorageUpgradeSafe } from '@openzeppelin/upgrades-core'

/* Imports: Internal */
import {
  ArtifactPaths,
  computeStorageSlots,
  SolidityStorageLayout,
} from '../languages/solidity'
import {
  ChugSplashAction,
  ChugSplashActionBundle,
  readStorageLayout,
  makeBundleFromActions,
  readContractArtifact,
} from '../actions'
import { getDefaultProxyAddress, isExternalProxyType } from '../utils'
import {
  UserChugSplashConfig,
  ParsedChugSplashConfig,
  ProxyType,
} from './types'
import { Integration } from '../constants'
import { getLatestDeployedStorageLayout } from '../deployed'

export const isEmptyChugSplashConfig = (configFileName: string): boolean => {
  delete require.cache[require.resolve(path.resolve(configFileName))]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.resolve(configFileName))
  return Object.keys(config).length === 0
}

/**
 * Validates a ChugSplash config file.
 *
 * @param config Config file to validate.
 */
export const assertValidUserConfigFields = (config: UserChugSplashConfig) => {
  if (config.contracts === undefined) {
    throw new Error('contracts field must be defined in ChugSplash config')
  }

  const referenceNames: string[] = Object.keys(config.contracts)

  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    // Block people from accidentally using templates in contract names.
    if (referenceName.includes('{') || referenceName.includes('}')) {
      throw new Error(
        `cannot use template strings in reference names: ${referenceName}`
      )
    }

    // Block people from accidentally using templates in contract names.
    if (
      contractConfig.contract.includes('{') ||
      contractConfig.contract.includes('}')
    ) {
      throw new Error(
        `cannot use template strings in contract names: ${contractConfig.contract}`
      )
    }

    // Make sure addresses are fixed and are actually addresses.
    if (
      contractConfig.externalProxy !== undefined &&
      !ethers.utils.isAddress(contractConfig.externalProxy)
    ) {
      throw new Error(
        `external proxy address is not a valid address: ${contractConfig.externalProxy}`
      )
    }

    // Make sure that the external proxy type is valid.
    if (
      contractConfig.externalProxyType !== undefined &&
      isExternalProxyType(contractConfig.externalProxyType)
    ) {
      throw new Error(
        `External proxy type is not valid: ${contractConfig.externalProxyType}`
      )
    }

    // The user must include both an `externalProxy` and `externalProxyType` field, or neither.
    if (
      contractConfig.externalProxy !== undefined &&
      contractConfig.externalProxyType === undefined
    ) {
      throw new Error(
        `User included an 'externalProxy' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxyType' field.`
      )
    } else if (
      contractConfig.externalProxy === undefined &&
      contractConfig.externalProxyType !== undefined
    ) {
      throw new Error(
        `User included an 'externalProxyType' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxy' field.`
      )
    }

    // Check for invalid contract references.
    if (contractConfig.variables !== undefined) {
      for (const [varName, varValue] of Object.entries(
        contractConfig.variables
      )) {
        if (
          typeof varValue === 'string' &&
          varValue.includes('{{') &&
          varValue.includes('}}')
        ) {
          if (!varValue.startsWith('{{')) {
            throw new Error(`Contract reference cannot contain leading spaces: ${varValue}
                 Location: ${config.options.projectName} -> ${referenceName} -> ${varName}
                 `)
          } else if (!varValue.endsWith('}}')) {
            throw new Error(`Contract reference cannot contain trailing spaces: ${varValue}
                  Location: ${config.options.projectName} -> ${referenceName} -> ${varName}
                  `)
          }

          const contractReference = varValue
            .substring(2, varValue.length - 2)
            .trim()

          if (!referenceNames.includes(contractReference)) {
            throw new Error(`Contract reference cannot be found: ${contractReference}
                  Location: ${config.options.projectName} -> ${referenceName} -> ${varName}
                  `)
          }
        }
      }
    }
  }
}

export const assertStorageSlotCheck = async (
  provider: providers.Provider,
  config: ParsedChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string
) => {
  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    const isProxyDeployed =
      (await provider.getCode(contractConfig.proxy)) !== '0x'
    if (isProxyDeployed && config.options.skipStorageCheck !== true) {
      const currStorageLayout = await getLatestDeployedStorageLayout(
        provider,
        referenceName,
        contractConfig.proxy,
        remoteExecution,
        canonicalConfigFolderPath
      )
      const newStorageLayout = readStorageLayout(
        contractConfig.contract,
        artifactPaths,
        integration
      )
      // Run OpenZeppelin's storage slot checker.
      assertStorageUpgradeSafe(
        currStorageLayout as any,
        newStorageLayout as any,
        false
      )
    }
  }
}

/**
 * Parses a ChugSplash config file from the config file given by the user.
 *
 * @param userConfig Unparsed config file to parse.
 * @param env Environment variables to inject into the file.
 * @return Parsed config file with template variables replaced.
 */
export const parseChugSplashConfig = async (
  provider: providers.Provider,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ParsedChugSplashConfig> => {
  const parsedConfig: ParsedChugSplashConfig = {
    options: userConfig.options,
    contracts: {},
  }

  const contracts = {}
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    if (
      userContractConfig.externalProxy !== undefined &&
      (await provider.getCode(userContractConfig.externalProxy)) === '0x'
    ) {
      throw new Error(
        `User entered a proxy address that does not exist: ${userContractConfig.externalProxy}`
      )
    }

    const { contract, externalProxy, externalProxyType, variables } =
      userContractConfig

    // Change the `contract` fields to be a fully qualified name. This ensures that it's easy for the
    // executor to create the `CanonicalConfigArtifacts` when it eventually compiles the canonical
    // config.
    const { sourceName, contractName } = readContractArtifact(
      artifactPaths,
      contract,
      integration
    )
    const contractFullyQualifiedName = `${sourceName}:${contractName}`

    // Set the proxy address to the user-defined value if it exists, otherwise set it to the default proxy
    // used by ChugSplash.
    const proxy =
      externalProxy ||
      getDefaultProxyAddress(userConfig.options.projectName, referenceName)

    const proxyType: ProxyType = externalProxyType ?? 'default'

    parsedConfig.contracts[referenceName] = {
      contract: contractFullyQualifiedName,
      proxy,
      proxyType,
      variables,
    }

    contracts[referenceName] = proxy
  }

  return JSON.parse(
    Handlebars.compile(JSON.stringify(parsedConfig))({
      ...contracts,
    })
  )
}

/**
 * Generates a ChugSplash action bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Action bundle generated from the parsed config file.
 */
export const makeActionBundleFromConfig = async (
  parsedConfig: ParsedChugSplashConfig,
  artifacts: {
    [name: string]: {
      creationCode: string
      storageLayout: SolidityStorageLayout
      immutableVariables: string[]
    }
  }
): Promise<ChugSplashActionBundle> => {
  const actions: ChugSplashAction[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const artifact = artifacts[referenceName]

    // Add a DEPLOY_IMPLEMENTATION action for each contract first.
    actions.push({
      referenceName,
      code: artifact.creationCode,
    })

    // Next, add a SET_IMPLEMENTATION action for each contract.
    actions.push({
      referenceName,
    })

    // Compute our storage slots.
    // TODO: One day we'll need to refactor this to support Vyper.
    const slots = computeStorageSlots(
      artifact.storageLayout,
      contractConfig,
      artifact.immutableVariables
    )

    // Add SET_STORAGE actions for each storage slot that we want to modify.
    for (const slot of slots) {
      actions.push({
        referenceName,
        key: slot.key,
        value: slot.val,
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromActions(actions)
}
