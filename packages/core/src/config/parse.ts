/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { ethers } from 'ethers'

/* Imports: Internal */
import {
  computeStorageSlots,
  SolidityStorageLayout,
} from '../languages/solidity'
import {
  ChugSplashAction,
  ChugSplashActionBundle,
  makeBundleFromActions,
} from '../actions'
import { getDefaultProxyAddress } from '../utils'
import {
  UserChugSplashConfig,
  ParsedChugSplashConfig,
  ParsedConfigVariable,
  ParsedConfigVariables,
  UserConfigVariables,
  UserConfigVariable,
} from './types'

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
export const validateChugSplashConfig = (config: UserChugSplashConfig) => {
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
      contractConfig.proxy !== undefined &&
      !ethers.utils.isAddress(contractConfig.proxy)
    ) {
      throw new Error(
        `contract address is not a valid address: ${contractConfig.proxy}`
      )
    }

    // Check for invalid contract references.
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

/**
 * Parses a ChugSplash config file by replacing template values.
 *
 * @param userConfig Unparsed config file to parse.
 * @param env Environment variables to inject into the file.
 * @return Parsed config file with template variables replaced.
 */
export const parseChugSplashConfig = (
  userConfig: UserChugSplashConfig
): ParsedChugSplashConfig => {
  validateChugSplashConfig(userConfig)

  let parsedConfig: ParsedChugSplashConfig = {
    options: userConfig.options,
    contracts: {},
  }

  const contracts = {}
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    const parsedVariables = {}
    for (const [varName, userVariable] of Object.entries(
      userContractConfig.variables
    )) {
      parsedVariables[varName] = convertNumbersToStrings(userVariable)
    }

    parsedConfig.contracts[referenceName] = {
      contract: userContractConfig.contract,
      variables: parsedVariables,
      // Set the proxy address to the user-defined value if it exists, otherwise set it to the
      // default proxy used by ChugSplash.
      proxy:
        userContractConfig.proxy ||
        getDefaultProxyAddress(userConfig.options.projectName, referenceName),
    }

    contracts[referenceName] = parsedConfig.contracts[referenceName].proxy
  }

  parsedConfig = JSON.parse(
    Handlebars.compile(JSON.stringify(parsedConfig))({
      ...contracts,
    })
  )

  return parsedConfig
}

const parseNumbersToStrings = (variables: ParsedConfigVariable) => {
  Object.keys(variables).forEach((varName) => {
    if (typeof variables[varName] === 'object') {
      return parseNumbersToStrings(variables[varName])
    } else if (typeof variables[varName] === 'number') {
      variables[varName] = variables[varName].toString()
    }
  })
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
      target: referenceName,
      code: artifact.creationCode,
    })

    // Next, add a SET_IMPLEMENTATION action for each contract.
    actions.push({
      target: referenceName,
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
        target: referenceName,
        key: slot.key,
        value: slot.val,
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromActions(actions)
}

export const convertNumbersToStrings = (
  userVariable: UserConfigVariable
): ParsedConfigVariable => {
  if (typeof userVariable === 'number') {
    return userVariable.toString()
  } else if (userVariable instanceof Array) {
    const parsedVariable = []
    for (const element of userVariable) {
      parsedVariable.push(convertNumbersToStrings(element))
    }
    return parsedVariable
  } else if (typeof userVariable === 'object') {
    const parsedVariable = {}
    for (const [varName, varValue] of Object.entries(userVariable)) {
      parsedVariable[varName] = convertNumbersToStrings(varValue)
    }
    return parsedVariable
  } else {
    return userVariable
  }
}
