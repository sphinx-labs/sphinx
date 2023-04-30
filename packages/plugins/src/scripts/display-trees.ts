import path from 'path'
import { argv } from 'node:process'

import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import {
  chugsplashCommitAbstractSubtask,
  readUnvalidatedChugSplashConfig,
  readValidatedChugSplashConfig,
} from '@chugsplash/core'
import { utils } from 'ethers'

import { getArtifactPaths } from '../hardhat/artifacts'
import { createChugSplashRuntime } from '../utils'

const chugsplashFilePath = argv[2]
if (typeof chugsplashFilePath !== 'string') {
  throw new Error(`Pass in a path to a ChugSplash config file.`)
}

/**
 * Display a ChugSplash deployment. This script can be called by running:
 * npx ts-node --require hardhat/register src/scripts/display-deployment-info.ts <path/to/chugsplash/file>
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 * This makes it easy to generate trees to be used when unit testing the ChugSplashManager.*
 */
const displayDeploymentInfo = async () => {
  const userConfig = await readUnvalidatedChugSplashConfig(chugsplashFilePath)
  const artifactPaths = await getArtifactPaths(
    hre,
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

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
    artifactPaths,
    'hardhat',
    cre
  )

  const { configUri, trees } = await chugsplashCommitAbstractSubtask(
    hre.ethers.provider,
    parsedConfig,
    '',
    false,
    artifactPaths,
    hre.config.paths.canonicalConfigs,
    'hardhat'
  )

  // Convert the siblings in the Merkle proof from Buffers to hex strings.
  for (const action of trees.actionTree.actions) {
    action.proof.siblings = action.proof.siblings.map((sibling) =>
      utils.hexlify(sibling)
    )
  }

  const deploymentInfo = { configUri, trees }

  process.stdout.write(JSON.stringify(deploymentInfo, null, 2))
}

displayDeploymentInfo()
