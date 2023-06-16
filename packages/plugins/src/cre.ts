import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ChugSplashRuntimeEnvironment } from '@chugsplash/core/dist/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createChugSplashRuntime = async (
  remoteExecution: boolean,
  autoConfirm: boolean,
  canonicalConfigPath: string,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): Promise<ChugSplashRuntimeEnvironment> => {
  return {
    canonicalConfigPath,
    remoteExecution,
    autoConfirm,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
