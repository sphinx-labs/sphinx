import { UserChugSplashConfig } from '@chugsplash/core'

export const owner = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'

// This config tests an upgrade of the ChugSplashManager's version. We use a config
// with a different owner because otherwise the ChugSplashManager's version will
// be altered for all subsequent tests in the test suite.
const config: UserChugSplashConfig = {
  options: {
    owner,
  },
  projects: {
    ManagerUpgrade: {
      contracts: {
        Stateless: {
          contract: 'Stateless',
          kind: 'immutable',
          constructorArgs: {
            _immutableUint: 1,
            _immutableContractReference: '{{ Stateless }}',
          },
        },
      },
    },
  },
}

export default config
