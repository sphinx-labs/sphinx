import { resolve } from 'path'

import { defaultAbiCoder } from 'ethers/lib/utils'
import {
  getMinimalConfig,
  readUserChugSplashConfig,
} from '@chugsplash/core/dist/config/config'

import { getFoundryConfigOptions } from './options'

const args = process.argv.slice(2)
const configPath = args[0]

// This function is in its own file to minimize the number of dependencies that are imported, as
// this speeds up the execution time of the script when called via FFI from Foundry.
;(async () => {
  const [userConfig] = await Promise.all([
    readUserChugSplashConfig(configPath),
    getFoundryConfigOptions(),
  ])

  const minimalConfig = getMinimalConfig(userConfig)

  const rootImportPath =
    process.env.DEV_FILE_PATH ?? './node_modules/@chugsplash/plugins/'
  const utilsArtifactFolder = `${rootImportPath}out/artifacts`

  const ChugSplashUtilsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${utilsArtifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`
    )).abi
  const minimalConfigType = ChugSplashUtilsABI.find(
    (fragment) => fragment.name === 'minimalConfig'
  ).outputs[0]

  const encodedConfigs = defaultAbiCoder.encode(
    [minimalConfigType, 'string'],
    [minimalConfig, JSON.stringify(userConfig)]
  )

  process.stdout.write(encodedConfigs)
})()
