import path from 'path'

import {
  ChugSplashConfig,
  parseChugSplashConfig,
  writeSnapshotId,
} from '@chugsplash/core'
import { TASK_COMPILE, TASK_CLEAN } from 'hardhat/builtin-tasks/task-names'

export const writeHardhatSnapshotId = async (hre: any) => {
  const networkName = hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
  await writeSnapshotId(
    networkName,
    hre.config.paths.deployed,
    await hre.network.provider.send('evm_snapshot', [])
  )
}

export const loadParsedChugSplashConfig = async (
  hre: any,
  configFileName: string
): Promise<ChugSplashConfig> => {
  delete require.cache[require.resolve(path.resolve(configFileName))]

  // Clean the artifacts to ensure that we're working with the latest build info.
  await hre.run(TASK_CLEAN, {
    quiet: true,
  })
  // Make sure we have the latest compiled code.
  await hre.run(TASK_COMPILE, {
    quiet: true,
  })

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configFileName))
  config = config.default || config
  return parseChugSplashConfig(config, process.env)
}

/**
 * Loads a ChugSplash config synchronously, skipping the compilation step that occurs in
 * `loadParsedChugSplashConfig`. You should use `loadParsedChugSplashConfig` unless you
 * have a good reason to skip compilation.
 *
 * @param configFileName Path to the ChugSplash config file.
 */
export const loadParsedChugSplashConfigSync = (
  configFileName: string
): ChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configFileName))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configFileName))
  config = config.default || config
  return parseChugSplashConfig(config, process.env)
}
