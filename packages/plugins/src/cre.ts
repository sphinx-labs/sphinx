import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { SphinxRuntimeEnvironment } from '@sphinx-labs/core/dist/types'
import { Integration } from '@sphinx-labs/core/dist/constants'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

export const createSphinxRuntime = (
  integration: Integration,
  remoteExecution: boolean,
  allowUnlimitedContractSize: boolean,
  confirm: boolean = false,
  compilerConfigPath: string,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  stream: NodeJS.WritableStream = process.stderr
): SphinxRuntimeEnvironment => {
  return {
    integration,
    compilerConfigPath,
    allowUnlimitedContractSize,
    remoteExecution,
    confirm,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
