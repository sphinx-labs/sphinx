import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { SphinxRuntimeEnvironment } from '@sphinx-labs/core/dist/types'
import { Integration } from '@sphinx-labs/core/dist/constants'

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
    // TODO(upgrades): add this back to the CRE when adding support for OpenZeppelin upgradeable contracts
    // importOpenZeppelinStorageLayout,
    hre,
  }
}
