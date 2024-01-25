import { execSync } from 'child_process'

import { CONTRACTS_LIBRARY_VERSION } from '@sphinx-labs/contracts'
import { spawnAsync } from '@sphinx-labs/core'

export const handleInstall = async () => {
  const args = [
    'install',
    `sphinx-labs/sphinx@${CONTRACTS_LIBRARY_VERSION}`,
    // We always use --no-commit here because it's necessary if the user has any files that have been changed, but not committed.
    // This will almost always be the case during installation b/c the user first needs to install our CLI.
    '--no-commit',
  ]

  const dependencyInstall = await spawnAsync('forge', args)
  if (dependencyInstall.code !== 0) {
    // The `stdout` contains the trace of the error.
    console.log(dependencyInstall.stdout)
    // The `stderr` contains the error message.
    console.log(dependencyInstall.stderr)
    process.exit(1)
  }

  // Foundry doesn't consistently install our subdependency, so we make sure it's installed ourselves.
  // We should test this out later and remove if possible.
  execSync(
    'cd lib/sphinx/packages/contracts && forge install --no-commit && cd ../../ && git restore packages/contracts/foundry.toml',
    { stdio: 'ignore' }
  )
}
