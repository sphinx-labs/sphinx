import { UserConfig } from '@sphinx-labs/core'

// This config tests an upgrade of the SphinxManager's version. We use a config
// with a different owner because otherwise the SphinxManager's version will
// be altered for all subsequent tests in the test suite.
const config: UserConfig = {
  projectName: 'ManagerUpgrade',
  contracts: {
    Stateless: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 1,
        _immutableAddress: '{{ Stateless }}',
      },
    },
  },
}

export default config
