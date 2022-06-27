/* Imports: External */
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
import { ChugSplashConfig } from './types'

/**
 * Validates a ChugSplash config file.
 *
 * @param config Config file to validate.
 */
export const validateChugSplashConfig = (config: ChugSplashConfig) => {
  if (config.contracts === undefined) {
    throw new Error('contracts field must be defined in ChugSplash config')
  }

  for (const [contractName, contractConfig] of Object.entries(
    config.contracts
  )) {
    // Block people from accidentally using templates in contract names.
    if (contractName.includes('{') || contractName.includes('}')) {
      throw new Error(
        `cannot use template strings in contract names: ${contractName}`
      )
    }

    // Block people from accidentally using templates in contract source names.
    if (
      contractConfig.source.includes('{') ||
      contractConfig.source.includes('}')
    ) {
      throw new Error(
        `cannot use template strings in contract source names: ${contractConfig.source}`
      )
    }

    // Make sure addresses are fixed and are actually addresses.
    if (
      contractConfig.address !== undefined &&
      !ethers.utils.isAddress(contractConfig.address)
    ) {
      throw new Error(
        `contract address is not a valid address: ${contractConfig.address}`
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
  config: ChugSplashConfig,
  env: any = {}
): ChugSplashConfig => {
  validateChugSplashConfig(config)

  const contracts = {}
  for (const [contractName, contractConfig] of Object.entries(
    config.contracts
  )) {
    contractConfig.address = contractConfig.address || '0x' + '00'.repeat(20)
    contracts[contractName] = contractConfig.address
  }

  return JSON.parse(
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
}

/**
 * Generates a ChugSplash action bundle from a config file.
 *
 * @param config Config file to convert into a bundle.
 * @param env Environment variables to inject into the config file.
 * @returns Action bundle generated from the parsed config file.
 */
export const makeActionBundleFromConfig = async (
  config: ChugSplashConfig,
  artifacts: {
    [name: string]: {
      bytecode: string
      storageLayout: SolidityStorageLayout
    }
  },
  env: {
    [key: string]: string | number | boolean
  } = {}
): Promise<ChugSplashActionBundle> => {
  // Parse the config to replace any template variables.
  const parsed = parseChugSplashConfig(config, env)

  const actions: ChugSplashAction[] = []
  for (const [, contractConfig] of Object.entries(parsed.contracts)) {
    const artifact = artifacts[contractConfig.source]

    // Add a SET_CODE action for each contract first.
    actions.push({
      target: contractConfig.address,
      code: artifact.bytecode,
    })

    // Compute our storage slots.
    // TODO: One day we'll need to refactor this to support Vyper.
    const slots = computeStorageSlots(
      artifact.storageLayout,
      contractConfig.variables
    )

    // Add SET_STORAGE actions for each storage slot that we want to modify.
    for (const slot of slots) {
      actions.push({
        target: contractConfig.address,
        key: slot.key,
        value: slot.val,
      })
    }
  }

  // Generate a bundle from the list of actions.
  return makeBundleFromActions(actions)
}
