import {
  ChugSplashRuntimeEnvironment,
  readUnvalidatedChugSplashConfig,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { importOpenZeppelinStorageLayouts } from './hardhat/artifacts'

export const createChugSplashRuntime = async (
  configPath: string,
  remoteExecution: boolean,
  autoConfirm: boolean,
  hre: HardhatRuntimeEnvironment | undefined
): Promise<ChugSplashRuntimeEnvironment> => {
  const userConfig = await readUnvalidatedChugSplashConfig(configPath)
  const openzeppelinStorageLayouts = hre
    ? await importOpenZeppelinStorageLayouts(hre, userConfig)
    : undefined

  return {
    configPath,
    canonicalConfigPath: hre ? hre.config.paths.canonicalConfigs : undefined,
    remoteExecution,
    autoConfirm,
    openzeppelinStorageLayouts,
  }
}
