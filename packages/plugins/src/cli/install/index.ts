import { execSync } from 'child_process'

import { CONTRACTS_LIBRARY_VERSION } from '@sphinx-labs/contracts'
import { spawnAsync, userConfirmation } from '@sphinx-labs/core'
import ora from 'ora'

import { sphinxUp } from './sphinxup'

const installWithUpdate = async (
  spinner: ora.Ora,
  skipLibrary: boolean,
  ci: boolean
) => {
  if (!ci) {
    if (process.env.SPHINX_INTERNAL_TEST__DEMO_TEST !== 'true') {
      await userConfirmation(
        'Would you like to install the Sphinx Foundry fork? This is required to use Sphinx and will replace your existing Foundry installation.\nConfirm? (y\\n):'
      )
    }
    const foundryupStatus = await spawnAsync('/bin/bash', [
      '-c',
      'curl -L https://foundry.paradigm.xyz | bash',
    ])
    if (foundryupStatus.code !== 0) {
      // The `stdout` contains the trace of the error.
      console.log(foundryupStatus.stdout)
      // The `stderr` contains the error message.
      console.log(foundryupStatus.stderr)
      process.exit(1)
    }

    execSync(sphinxUp, { stdio: 'inherit', shell: '/bin/bash' })
  }

  if (skipLibrary) {
    return
  }

  spinner.start('Installing Sphinx Solidity library...')

  const args = [
    'install',
    `sphinx-labs/sphinx@${CONTRACTS_LIBRARY_VERSION}`,
    // We always use --no-commit here because it's necessary if the user has any files that have been changed, but not committed.
    // This will almost always be the case during installation b/c the user first needs to install our CLI.
    '--no-commit',
  ]

  // Check if the library is installed
  const submoduleStatus = await spawnAsync('git', ['submodule', 'status'])
  if (submoduleStatus.code !== 0) {
    // The `stdout` contains the trace of the error.
    console.log(submoduleStatus.stdout)
    // The `stderr` contains the error message.
    console.log(submoduleStatus.stderr)
    process.exit(1)
  }

  // If the library is already installed, then we need to update it by fetching the latest branches
  // and installing the correct version.
  if (submoduleStatus.stdout.includes('lib/sphinx')) {
    // submodule status will indicate that our library is installed even if the `lib/sphinx` has been deleted
    // which will cause the update to fail. So we have to run `forge install` to ensure the current version of the
    // library is in the file system.
    const installExistingDeps = await spawnAsync('forge', ['install'])
    if (installExistingDeps.code !== 0) {
      // The `stdout` contains the trace of the error.
      console.log(installExistingDeps.stdout)
      // The `stderr` contains the error message.
      console.log(installExistingDeps.stderr)
      process.exit(1)
    }

    // Run forge update to fetch the latest branches
    const update = await spawnAsync('forge', ['update', 'sphinx-labs/sphinx'])
    if (update.code !== 0) {
      // The `stdout` contains the trace of the error.
      console.log(update.stdout)
      // The `stderr` contains the error message.
      console.log(update.stderr)
      process.exit(1)
    }

    // Install the correct version
    const install = await spawnAsync('forge', args)
    if (install.code !== 0) {
      // The `stdout` contains the trace of the error.
      console.log(install.stdout)
      // The `stderr` contains the error message.
      console.log(install.stderr)
      process.exit(1)
    }
  } else {
    const install = await spawnAsync('forge', args)
    if (install.code !== 0) {
      // The `stdout` contains the trace of the error.
      console.log(install.stdout)
      // The `stderr` contains the error message.
      console.log(install.stderr)
      process.exit(1)
    }
  }
}

export const handleInstall = async (
  spinner: ora.Ora,
  skipLibrary: boolean,
  ci: boolean
) => {
  await installWithUpdate(spinner, skipLibrary, ci)
  if (skipLibrary) {
    return
  }

  // Foundry doesn't consistently install our subdependency, so we make sure it's installed ourselves.
  // We should test this out later and remove if possible.
  execSync(
    'cd lib/sphinx/packages/contracts && forge install --no-commit && cd ../../ && git restore packages/contracts/foundry.toml',
    { stdio: 'ignore' }
  )
  spinner.succeed('Successfully installed Sphinx Solidity library')
}
