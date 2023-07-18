import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { SphinxRuntimeEnvironment } from '@sphinx/core/dist/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createSphinxRuntime = (
  remoteExecution: boolean,
  confirmUpgrade: boolean = false,
  canonicalConfigPath: string,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): SphinxRuntimeEnvironment => {
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
