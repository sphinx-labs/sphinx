import path from 'path'

import {
  bundleLocal,
  readParsedChugSplashConfig,
  readUserChugSplashConfig,
} from '@chugsplash/core'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { utils } from 'ethers'

import { getArtifactPaths } from './hardhat'

export const TASK_CHUGSPLASH_DISPLAY_BUNDLE = 'chugsplash-display-bundle'

export const chugsplashDisplayBundleTask = async (
  args: {
    configPath: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath } = args

  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    hre,
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  const parsedConfig = await readParsedChugSplashConfig(
    hre.ethers.provider,
    configPath,
    artifactPaths,
    'hardhat'
  )
  const bundle = await bundleLocal(parsedConfig, artifactPaths, 'hardhat')

  for (const action of bundle.actions) {
    action.proof.siblings = action.proof.siblings.map((sibling) =>
      utils.hexlify(sibling)
    )
  }

  process.stdout.write(JSON.stringify(bundle, null, 2))
}

task(TASK_CHUGSPLASH_DISPLAY_BUNDLE)
  .addParam('configPath', 'Path to the ChugSplash config file')
  .setAction(chugsplashDisplayBundleTask)
