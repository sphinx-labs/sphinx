import { resolve } from 'path'

import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'
import {
  getFoundryConfig,
  readUserSphinxConfig,
} from '@sphinx-labs/core/dist/config/config'

import { getEncodedFailure, validationStderrWrite } from './logs'

const args = process.argv.slice(2)
const configPath = args[0]
const ownerAddress = args[1]

// This function is in its own file to minimize the number of dependencies that are imported, as
// this speeds up the execution time of the script when called via FFI from Foundry. Note that this
// function must not rely on a provider object being available because a provider doesn't exist
// outside of Solidity for the in-process Anvil node.
;(async () => {
  process.stderr.write = validationStderrWrite
  try {
    const userConfig = await readUserSphinxConfig(configPath)

    const minimalConfig = getFoundryConfig(userConfig, ownerAddress)

    const rootImportPath =
      process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'
    const utilsArtifactFolder = `${rootImportPath}out/artifacts`

    const SphinxUtilsABI =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(resolve(
        `${utilsArtifactFolder}/SphinxUtils.sol/SphinxUtils.json`
      )).abi
    const minimalConfigType = SphinxUtilsABI.find(
      (fragment) => fragment.name === 'minimalConfig'
    ).outputs[0]

    const encodedConfigs = defaultAbiCoder.encode(
      [minimalConfigType, 'string'],
      [minimalConfig, JSON.stringify(userConfig)]
    )

    const encodedSuccess = hexConcat([
      encodedConfigs,
      defaultAbiCoder.encode(['bool'], [true]), // true = success
    ])

    process.stdout.write(encodedSuccess)
  } catch (err) {
    const encodedFailure = getEncodedFailure(err)
    process.stdout.write(encodedFailure)
  }
})()
