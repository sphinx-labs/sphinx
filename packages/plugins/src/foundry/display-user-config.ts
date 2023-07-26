import { argv } from 'process'

import { readUserConfig } from '@sphinx/core/dist/config/config'

const configPath = argv[2]
if (typeof configPath !== 'string') {
  throw new Error(`Pass in a path to a Sphinx config file.`)
}

;(async () => {
  const userConfig = await readUserConfig(configPath)
  process.stdout.write(JSON.stringify(userConfig, null, 2))
})()
