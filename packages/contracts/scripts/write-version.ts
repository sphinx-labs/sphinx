import { getCurrentGitCommitHash } from '../src'

/**
 * Generates a Typescript constant for the contracts package version which is used by the plugins package to determine what
 * the correct version of the Sphinx library contracts is.
 */
const writeVersion = async () => {
  const commit = getCurrentGitCommitHash()
  if (!commit) {
    throw Error('Failed to fetch git commit hash')
  }
  const file = `export const CONTRACTS_LIBRARY_COMMIT_HASH = '${commit}'\n`
  process.stdout.write(file)
}

writeVersion()
