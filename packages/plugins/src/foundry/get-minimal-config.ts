import { defaultAbiCoder } from 'ethers/lib/utils'
import {
  getMinimalConfig,
  readUserChugSplashConfig,
} from '@chugsplash/core/dist/config/config'

import { getPaths } from './paths'

const args = process.argv.slice(2)
const configPath = args[0]

// This function is in its own file to minimize the number of dependencies that are imported, as
// this speeds up the execution time of the script when called via FFI from Foundry.
;(async () => {
  const [userConfig, { artifactFolder }] = await Promise.all([
    readUserChugSplashConfig(configPath),
    getPaths(),
  ])

  const minimalConfig = getMinimalConfig(userConfig)

  const ChugSplashUtilsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi
  const minimalConfigType = ChugSplashUtilsABI.find(
    (fragment) => fragment.name === 'minimalConfig'
  ).outputs[0]

  const encodedConfigs = defaultAbiCoder.encode(
    [minimalConfigType, 'string'],
    [minimalConfig, JSON.stringify(userConfig)]
  )

  process.stdout.write(encodedConfigs)
})()
