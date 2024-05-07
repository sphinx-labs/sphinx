import { version } from '../package.json'

/**
 * Generates a Typescript constant for the plugins package version which is supplied when proposing to the website. This allows
 * us to determine when we can safely deprecate fields in the propose endpoint.
 */
const writeVersion = async () => {
  const file = `export const SPHINX_PLUGINS_VERSION = 'v${version}'\n`
  process.stdout.write(file)
}

writeVersion()
