import {
  ChugSplashRuntimeEnvironment,
  ParsedContractConfig,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

const fetchOpenZeppelinStorageLayout = async (
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  parsedContractConfig: ParsedContractConfig
) => {
  return hre
    ? importOpenZeppelinStorageLayout(hre, parsedContractConfig)
    : undefined
}

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
    fetchOpenZeppelinStorageLayout,
    hre,
  }
}
