import { resolve } from 'path'

import {
  FoundryConfig,
  FoundryContractConfig,
  ParsedConfig,
  UserConfig,
  UserConfigWithOptions,
  UserSphinxConfig,
} from './types'
import { getTargetAddress, getUserSaltHash, toContractKindEnum } from './utils'

/**
 * Returns a minimal version of the Sphinx config. This is used as a substitute for the full
 * config in Solidity for the Sphinx Foundry plugin. We use it because of Solidity's limited
 * support for types. We limit the number of fields in the minimal config to minimize the amount of
 * work that occurs in TypeScript, since this improves the speed of the Foundry plugin.
 */
export const getFoundryConfig = (
  parsedConfig: ParsedConfig,
  chainId: string,
  owner: string
): FoundryConfig => {
  const minimalContractConfigs: Array<FoundryContractConfig> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { address, kind, salt } = contractConfig

    const targetAddress =
      address ?? getTargetAddress(parsedConfig.manager, referenceName, salt)

    minimalContractConfigs.push({
      referenceName,
      addr: targetAddress,
      kind: toContractKindEnum(kind),
      userSaltHash: getUserSaltHash(salt),
    })
  }

  const postDeploy = parsedConfig.postDeploy[chainId] ?? []

  return {
    manager: parsedConfig.manager,
    owner,
    projectName: parsedConfig.projectName,
    contracts: minimalContractConfigs,
    postDeploy,
  }
}

export const readUserConfig = async (
  configPath: string
): Promise<UserConfig> => {
  const userConfig = (await readUserSphinxConfig(configPath)) as UserConfig

  // We should refactor the deploy task so it still uses the options
  // For now, we just delete the options field if it exists and cast this to a UserConfig so that
  // the deploy task doesn't break.
  if (userConfig.options) {
    delete userConfig.options
  }
  return userConfig as UserConfig
}

export const readUserConfigWithOptions = async (
  configPath: string
): Promise<UserConfigWithOptions> => {
  const userConfig = await readUserSphinxConfig(configPath)
  if (!userConfig.options) {
    throw new Error(`Did not detect 'options' field in config.`)
  }
  return userConfig
}

export const readUserSphinxConfig = async (
  configPath: string
): Promise<UserSphinxConfig> => {
  let rawConfig
  try {
    // Remove the config from the cache. Without removing it, it'd be possible for this function to
    // return a version of the config that has been mutated in-memory.
    delete require.cache[require.resolve(resolve(configPath))]

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exported = require(resolve(configPath))
    rawConfig = exported.default || exported
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      // We throw a more helpful error message than the default "Module not found" message.
      throw new Error(`File does not exist: ${resolve(configPath)}`)
    } else {
      throw err
    }
  }

  let config: UserSphinxConfig
  if (typeof rawConfig === 'function') {
    config = await rawConfig()
  } else if (typeof rawConfig === 'object') {
    config = rawConfig
  } else {
    throw new Error(
      'Config file must export either a config object, or a function which resolves to one.'
    )
  }
  return config
}
