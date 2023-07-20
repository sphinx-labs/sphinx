import { argv } from 'process'

import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import {
  getParsedConfig,
  getProjectBundleInfo,
  readUserConfig,
} from '@sphinx/core'
import { utils } from 'ethers'

import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'
import { createSphinxRuntime } from '../src/cre'

const configPath = argv[2]
if (typeof configPath !== 'string') {
  throw new Error(`Pass in a path to a Sphinx config file.`)
}

/**
 * Display a Sphinx bundle. The purpose of this script is to easily generate bundles in a format
 * that can be used alongside the `vm.readJson` cheatcode in order to test the Sphinx contracts
 * with Forge. This script is NOT meant to be called via FFI in the Foundry plugin.
 *
 * This script can be called by running:
 * npx ts-node --require hardhat/register src/scripts/display-bundle-info.ts <path/to/sphinx/file>
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 */
const displayBundleInfo = async () => {
  const provider = hre.ethers.provider

  const cre = createSphinxRuntime(
    false,
    true,
    hre.config.paths.compilerConfigs,
    undefined,
    false
  )

  const { parsedConfig, configCache, configArtifacts } = await getParsedConfig(
    await readUserConfig(configPath),
    provider,
    cre,
    makeGetConfigArtifacts(hre)
  )

  const { configUri, bundles } = await getProjectBundleInfo(
    parsedConfig,
    configArtifacts,
    configCache
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
