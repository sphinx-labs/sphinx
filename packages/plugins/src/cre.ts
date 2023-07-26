import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { SphinxRuntimeEnvironment } from '@sphinx/core/dist/types'
import { Integration } from '@sphinx/core/dist/constants'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createSphinxRuntime = (
  integration: Integration,
  remoteExecution: boolean,
  confirm: boolean = false,
  compilerConfigPath: string,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): SphinxRuntimeEnvironment => {
  return {
    integration,
    compilerConfigPath,
    remoteExecution,
    confirm,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
