import { argv } from 'node:process'

import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import {
  chugsplashCommitAbstractSubtask,
  readUnvalidatedChugSplashConfig,
  readValidatedChugSplashConfig,
} from '@chugsplash/core'
import { utils } from 'ethers'

import { getConfigArtifacts } from '../hardhat/artifacts'
import { createChugSplashRuntime } from '../utils'

const chugsplashFilePath = argv[2]
if (typeof chugsplashFilePath !== 'string') {
  throw new Error(`Pass in a path to a ChugSplash config file.`)
}

/**
 * Display a ChugSplash bundle. This script can be called by running:
 * npx ts-node --require hardhat/register src/scripts/display-bundle-info.ts <path/to/chugsplash/file>
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 * This makes it easy to generate bundles to be used when unit testing the ChugSplashManager.*
 */
const displayBundleInfo = async () => {
  const userConfig = await readUnvalidatedChugSplashConfig(chugsplashFilePath)
  const configArtifacts = await getConfigArtifacts(hre, userConfig.contracts)

  const cre = await createChugSplashRuntime(
    chugsplashFilePath,
    false,
    true,
    hre.config.paths.canonicalConfigs,
    undefined,
    false
  )

  const parsedConfig = await readValidatedChugSplashConfig(
    hre.ethers.provider,
    chugsplashFilePath,
    configArtifacts,
    'hardhat',
    cre
  )

  const { configUri, bundles } = await chugsplashCommitAbstractSubtask(
    hre.ethers.provider,
    parsedConfig,
    '',
    false,
    configArtifacts,
    hre.config.paths.canonicalConfigs,
    'hardhat'
  )

  // Convert the siblings in the Merkle proof from Buffers to hex strings.
  for (const action of bundles.actionBundle.actions) {
    action.proof.siblings = action.proof.siblings.map((sibling) =>
      utils.hexlify(sibling)
    )
  }

  const bundleInfo = { configUri, bundles }

  process.stdout.write(JSON.stringify(bundleInfo, null, 2))
}

displayBundleInfo()
