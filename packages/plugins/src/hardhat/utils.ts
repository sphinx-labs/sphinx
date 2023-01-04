import path from 'path'

import {
  ParsedChugSplashConfig,
  getChugSplashManagerProxyAddress,
  getChugSplashRegistry,
  parseChugSplashConfig,
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

/**
 * Loads a ChugSplash config file synchronously.
 *
 * @param configPath Path to the ChugSplash config file.
 */
export const loadParsedChugSplashConfig = (
  configPath: string
): ParsedChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configPath))
  config = config.default || config
  return parseChugSplashConfig(config)
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
