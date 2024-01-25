import { version } from '../package.json'

/**
 * Generates a Typescript constant for the contracts package version which is used by the plugins package to determine what
 * the correct version of the Sphinx library contracts is.
 */
const writeVersion = async () => {
  const file = `export const CONTRACTS_LIBRARY_VERSION = 'v${version}'\n`
  process.stdout.write(file)
}

writeVersion()
