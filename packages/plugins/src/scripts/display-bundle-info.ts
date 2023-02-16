import path from 'path'
import { argv } from 'node:process'

import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import {
  chugsplashCommitAbstractSubtask,
  readParsedChugSplashConfig,
  readUserChugSplashConfig,
} from '@chugsplash/core'
import { utils } from 'ethers'

import { getArtifactPaths } from '../hardhat/artifacts'

const chugsplashFilePath = argv[2]
if (typeof chugsplashFilePath !== 'string') {
  throw new Error(`Pass in a path to a ChugSplash file.`)
}

/**
 * Display a ChugSplash bundle. This script can be called by running:
 * npx ts-node --require hardhat/register src/scripts/display-bundle-info.ts <path/to/chugsplash/file>
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 * This makes it easy to generate bundles to be used when unit testing the ChugSplashManager.*
 */
const displayBundleInfo = async () => {
  const userConfig = readUserChugSplashConfig(chugsplashFilePath)
  const artifactPaths = await getArtifactPaths(
    hre,
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  const parsedConfig = await readParsedChugSplashConfig(
    hre.ethers.provider,
    chugsplashFilePath,
    artifactPaths,
    'hardhat'
  )

  const { configUri, bundle } = await chugsplashCommitAbstractSubtask(
    hre.ethers.provider,
    hre.ethers.provider.getSigner(),
    parsedConfig,
    '',
    false,
    artifactPaths,
    hre.config.paths.canonicalConfigs,
    'hardhat'
  )

  // Convert the siblings in the Merkle proof from Buffers to hex strings.
  for (const action of bundle.actions) {
    action.proof.siblings = action.proof.siblings.map((sibling) =>
      utils.hexlify(sibling)
    )
  }

  const bundleInfo = { configUri, bundle }

  process.stdout.write(JSON.stringify(bundleInfo, null, 2))
}

displayBundleInfo()
