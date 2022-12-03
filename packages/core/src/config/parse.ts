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
  UserConfigVariable,
  ContractReference,
  ParsedChugSplashConfig,
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
  }
}

/**
 * Parses a ChugSplash config file by replacing template values.
 *
 * @param config Unparsed config file to parse.
 * @param env Environment variables to inject into the file.
 * @return Parsed config file with template variables replaced.
 */
export const parseChugSplashConfig = (
  config: UserChugSplashConfig,
  env: any
): ParsedChugSplashConfig => {
  validateChugSplashConfig(config)

  const contracts = {}
  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    // Set the proxy address to the user-defined value if it exists, otherwise set it to the default proxy
    // used by ChugSplash.
    contractConfig.proxy =
      contractConfig.proxy ||
      getDefaultProxyAddress(config.options.projectName, referenceName)
    contracts[referenceName] = contractConfig.proxy
  }

  const parsed: ParsedChugSplashConfig = JSON.parse(
    Handlebars.compile(JSON.stringify(config))({
      env: new Proxy(env, {
        get: (target, prop) => {
          const val = target[prop]
          if (val === undefined) {
            throw new Error(
              `attempted to access unknown env value: ${prop as any}`
            )
          }
          return val
        },
      }),
      contracts: new Proxy(contracts, {
        get: (target, prop) => {
          const val = target[prop]
          if (val === undefined) {
            throw new Error(
              `attempted to access unknown contract: ${prop as any}`
            )
          }
          return val
        },
      }),
    })
  )

  return parseContractReferences(parsed)
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

export const parseContractReferences = (
  config: UserChugSplashConfig
): ParsedChugSplashConfig => {
  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    for (const [variableName, variable] of Object.entries(
      contractConfig.variables
    )) {
      if (isContractReference(variable)) {
        const [targetReferenceName] = Object.values(variable)
        const targetContractConfig = config.contracts[targetReferenceName]
        if (targetContractConfig === undefined) {
          throw new Error(
            `Could not find a contract definition for ${targetReferenceName} in the config file for
${config.options.projectName}. Please create a contract definition for ${targetReferenceName} or
remove the reference to it in the "${variableName}" variable in your contract definition for
${referenceName}.`
          )
        }
        // Set the variable to be the user-defined proxy address if it exists, otherwise use the
        // default proxy address.
        config.contracts[referenceName].variables[variableName] =
          targetContractConfig.proxy
            ? targetContractConfig.proxy
            : getDefaultProxyAddress(
                config.options.projectName,
                targetReferenceName.trim()
              )
      }
    }
  }
  return config as ParsedChugSplashConfig
}

export const isContractReference = (
  variable: UserConfigVariable
): variable is ContractReference => {
  return (variable as ContractReference)['!Ref'] !== undefined
}
