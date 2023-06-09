import { argv } from 'process'

import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import { getBundleInfo, readValidatedChugSplashConfig } from '@chugsplash/core'
import { utils } from 'ethers'

import { makeGetConfigArtifacts } from '../hardhat/artifacts'
import { createChugSplashRuntime } from '../cre'

const configPath = argv[2]
if (typeof configPath !== 'string') {
  throw new Error(`Pass in a path to a ChugSplash config file.`)
}

/**
 * Display a ChugSplash bundle. The purpose of this script is to easily generate bundles in a format
 * that can be used alongside the `vm.readJson` cheatcode in order to test the ChugSplash contracts
 * with Forge. This script is NOT meant to be called via FFI in the Foundry plugin.
 *
 * This script can be called by running:
 * npx ts-node --require hardhat/register src/scripts/display-bundle-info.ts <path/to/chugsplash/file>
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 */
const displayBundleInfo = async () => {
  const provider = hre.ethers.provider

  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    undefined,
    false
  )

  const { parsedConfig, configCache, configArtifacts } =
    await readValidatedChugSplashConfig(
      configPath,
      provider,
      cre,
      makeGetConfigArtifacts(hre)
    )

  const { configUri, bundles } = await getBundleInfo(
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
