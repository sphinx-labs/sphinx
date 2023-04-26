import { ChugSplashRuntimeEnvironment } from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createChugSplashRuntime = async (
  configPath: string,
  remoteExecution: boolean,
  autoConfirm: boolean,
  canonicalConfigPath: string,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): Promise<ChugSplashRuntimeEnvironment> => {
  return {
    configPath,
    canonicalConfigPath,
    remoteExecution,
    autoConfirm,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
