/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { ethers, providers } from 'ethers'
import { CHUGSPLASH_REGISTRY_PROXY_ADDRESS } from '@chugsplash/contracts'

import { ArtifactPaths } from '../languages/solidity/types'
import {
  getDefaultProxyAddress,
  isExternalProxyType,
  readContractArtifact,
  assertValidContractReferences,
  variableContainsPreserveKeyword,
} from '../utils'
import {
  UserChugSplashConfig,
  ParsedChugSplashConfig,
  ProxyType,
  UserConfigVariables,
  ParsedConfigVariables,
} from './types'
import { Integration } from '../constants'

/**
 * Reads a ChugSplash config file synchronously.
 *
 * @param configPath Path to the ChugSplash config file.
 * @returns The parsed ChugSplash config file.
 */
export const readParsedChugSplashConfig = async (
  provider: providers.Provider,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ParsedChugSplashConfig> => {
  const userConfig = readUserChugSplashConfig(configPath)
  return parseChugSplashConfig(provider, userConfig, artifactPaths, integration)
}

export const readUserChugSplashConfig = (
  configPath: string
): UserChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configPath))
  config = config.default || config
  assertValidUserConfigFields(config)
  return config
}

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
      isExternalProxyType(contractConfig.externalProxyType) === false
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
          `but did not include an 'externalProxyType' field. Please include both or neither.`
      )
    } else if (
      contractConfig.externalProxy === undefined &&
      contractConfig.externalProxyType !== undefined
    ) {
      throw new Error(
        `User included an 'externalProxyType' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxy' field. Please include both or neither.`
      )
    }

    if (
      contractConfig.previousBuildInfo !== undefined &&
      contractConfig.previousFullyQualifiedName === undefined
    ) {
      throw new Error(
        `User included a 'previousBuildInfo' field in the ChugSplash file for ${contractConfig.contract}, but\n` +
          `did not include a 'previousFullyQualifiedName' field. Please include both or neither.`
      )
    } else if (
      contractConfig.previousBuildInfo === undefined &&
      contractConfig.previousFullyQualifiedName !== undefined
    ) {
      throw new Error(
        `User included a 'previousFullyQualifiedName' field in the ChugSplash file for ${contractConfig.contract}, but\n` +
          `did not include a 'previousBuildInfo' field. Please include both or neither.`
      )
    }

    if (contractConfig.variables !== undefined) {
      // Check that all contract references are valid.
      assertValidContractReferences(contractConfig.variables, referenceNames)
    }

    if (contractConfig.constructorArgs !== undefined) {
      // Check that the user did not use the 'preserve' keyword for constructor args.
      if (variableContainsPreserveKeyword(contractConfig.constructorArgs)) {
        throw new Error(
          `Detected the '{preserve}' keyword in the 'constructorArgs' field of your ChugSplash file. This \n` +
            `keyword can only be used in the 'variables' field. Please remove all instances of it in 'constructorArgs'.`
        )
      }
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

    const { externalProxy, externalProxyType, variables, constructorArgs } =
      userContractConfig

    // Change the `contract` fields to be a fully qualified name. This ensures that it's easy for the
    // executor to create the `CanonicalConfigArtifacts` when it eventually compiles the canonical
    // config.
    const { sourceName, contractName } = readContractArtifact(
      artifactPaths[referenceName].contractArtifactPath,
      integration
    )
    const contractFullyQualifiedName = `${sourceName}:${contractName}`

    // Set the proxy address to the user-defined value if it exists, otherwise set it to the default proxy
    // used by ChugSplash.
    const proxy =
      externalProxy ||
      getDefaultProxyAddress(userConfig.options.projectName, referenceName)

    let proxyType: ProxyType
    if (externalProxyType) {
      proxyType = externalProxyType
    } else if (proxy === CHUGSPLASH_REGISTRY_PROXY_ADDRESS) {
      // Will be removed when ChugSplash is non-upgradeable.
      proxyType = 'internal-registry'
    } else {
      proxyType = 'internal-default'
    }

    parsedConfig.contracts[referenceName] = {
      contract: contractFullyQualifiedName,
      proxy,
      proxyType,
      variables: variables ?? {},
      constructorArgs: constructorArgs ?? {},
    }

    contracts[referenceName] = proxy
  }

  return JSON.parse(
    Handlebars.compile(JSON.stringify(parsedConfig))({
      ...contracts,
    })
  )
}
