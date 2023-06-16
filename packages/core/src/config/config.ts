import { resolve } from 'path'

import {
  MinimalConfig,
  MinimalContractConfig,
  UserChugSplashConfig,
} from './types'
import { getTargetAddress, getUserSaltHash, toContractKindEnum } from './utils'
import { getChugSplashManagerAddress } from '../addresses'

/**
 * Returns a minimal version of the ChugSplash config. This is used as a substitute for the full
 * config in Solidity for the ChugSplash Foundry plugin. We use it because of Solidity's limited
 * support for types. We limit the number of fields in the minimal config to minimize the amount of
 * work that occurs in TypeScript, since this improves the speed of the Foundry plugin.
 */
export const getMinimalConfig = (
  userConfig: UserChugSplashConfig
): MinimalConfig => {
  const { organizationID, projectName } = userConfig.options
  const managerAddress = getChugSplashManagerAddress(organizationID)

  const minimalContractConfigs: Array<MinimalContractConfig> = []
  for (const [referenceName, contractConfig] of Object.entries(
    userConfig.contracts
  )) {
    const { address, kind, salt } = contractConfig

    const targetAddress =
      address ??
      getTargetAddress(managerAddress, projectName, referenceName, salt)

    minimalContractConfigs.push({
      referenceName,
      addr: targetAddress,
      kind: toContractKindEnum(kind ?? 'proxy'),
      userSaltHash: getUserSaltHash(salt),
    })
  }
  return {
    organizationID,
    projectName,
    contracts: minimalContractConfigs,
  }
}

export const readUserChugSplashConfig = async (
  configPath: string
): Promise<UserChugSplashConfig> => {
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
      throw new Error(`User entered an incorrect config path: ${configPath}`)
    } else {
      throw err
    }
  }

  let config: UserChugSplashConfig
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
