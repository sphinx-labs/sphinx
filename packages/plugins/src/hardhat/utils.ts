import {
  getChugSplashManagerProxyAddress,
  getChugSplashRegistry,
  writeSnapshotId,
} from '@chugsplash/core'
import { Signer } from 'ethers'
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

export const isProjectRegistered = async (
  signer: Signer,
  projectName: string
) => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const isRegistered: boolean = await ChugSplashRegistry.managers(
    chugsplashManagerAddress
  )
  return isRegistered
}
