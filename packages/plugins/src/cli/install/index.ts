import { execSync } from 'child_process'

import { CONTRACTS_LIBRARY_VERSION } from '@sphinx-labs/contracts'

export const handleInstall = async (noCommit: boolean) => {
  const args = [
    'forge',
    'install',
    `sphinx-labs/sphinx@${CONTRACTS_LIBRARY_VERSION}`,
  ]
  if (noCommit) {
    args.push('--no-commit')
  }
  execSync(args.join(' '), { stdio: 'inherit' })
}
