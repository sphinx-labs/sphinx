import { StdioOptions, execSync } from 'child_process'

import { CONTRACTS_LIBRARY_COMMIT_HASH } from '@sphinx-labs/contracts'

export const handleInstall = async (noCommit: boolean, stdio: StdioOptions) => {
  const args = [
    'forge',
    'install',
    `sphinx-labs/sphinx@${CONTRACTS_LIBRARY_COMMIT_HASH}`,
  ]
  if (noCommit) {
    args.push('--no-commit')
  }
  execSync(args.join(' '), { stdio })
}
