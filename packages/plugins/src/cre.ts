import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ChugSplashRuntimeEnvironment } from '@chugsplash/core/dist/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createChugSplashRuntime = (
  remoteExecution: boolean,
  confirmUpgrade: boolean = false,
  canonicalConfigPath: string,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): ChugSplashRuntimeEnvironment => {
  return {
    canonicalConfigPath,
    remoteExecution,
    confirmUpgrade,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
