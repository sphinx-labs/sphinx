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
      kind: toContractKindEnum(kind ?? 'internal-default'),
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
  delete require.cache[require.resolve(resolve(configPath))]

  let config
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let exported = require(resolve(configPath))
  exported = exported.default || exported
  if (typeof exported === 'function') {
    config = await exported()
  } else if (typeof exported === 'object') {
    config = exported
  } else {
    throw new Error(
      'Config file must export either a config object, or a function which resolves to one.'
    )
  }
  return config
}
