import { writeSnapshotId } from '@chugsplash/core'

export const writeHardhatSnapshotId = async (hre: any) => {
  const networkName = hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
  await writeSnapshotId(
    networkName,
    hre.config.paths.deployed,
    await hre.network.provider.send('evm_snapshot', [])
  )
}
