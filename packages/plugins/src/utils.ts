import { ChugSplashRuntimeEnvironment } from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createChugSplashRuntime = async (
  configPath: string,
  remoteExecution: boolean,
  autoConfirm: boolean,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): Promise<ChugSplashRuntimeEnvironment> => {
  return {
    configPath,
    canonicalConfigPath: hre ? hre.config.paths.canonicalConfigs : undefined,
    remoteExecution,
    autoConfirm,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
