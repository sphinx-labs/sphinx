import child_process from 'child_process'

import { expect } from 'chai'
import sinon from 'sinon'

import { getCurrentGitCommitHash } from '../../src'

describe('getCurrentGitCommitHash', () => {
  it('should not output to stderr when execSync fails', () => {
    const execSyncStub = sinon.stub(child_process, 'execSync')
    execSyncStub.throws(new Error('execSync failed'))
    const result = getCurrentGitCommitHash()

    // Check that `execSync` was called with "2>/dev/null", discards the `stderr`. We do this
    // instead of explicitly checking that nothing was written to `stderr` since because
    // overriding `stderr` would require a more complex setup involving a spy or mock on the
    // stderr stream itself, which is outside the scope of typical unit testing practices.
    sinon.assert.calledWith(execSyncStub, 'git rev-parse HEAD 2>/dev/null')

    expect(result).to.be.null

    execSyncStub.restore()
  })

  it('should return a commit hash when in a git repository', () => {
    const commitHash = getCurrentGitCommitHash()

    // Narrow the TypeScript type.
    if (typeof commitHash !== 'string') {
      throw new Error(`Git commit hash isn't a string.`)
    }

    expect(commitHash.length).equals(40)
  })
})
