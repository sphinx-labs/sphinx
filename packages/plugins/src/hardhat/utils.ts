import { writeSnapshotId } from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

export const writeHardhatSnapshotId = async (
  hre: HardhatRuntimeEnvironment,
  networkName?: string
) => {
  const inferredNetworkName =
    hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
  await writeSnapshotId(
    networkName === undefined ? inferredNetworkName : networkName,
    hre.config.paths.deployments,
    await hre.network.provider.send('evm_snapshot', [])
  )
}
