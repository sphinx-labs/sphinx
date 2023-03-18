import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectID: '0x' + '11'.repeat(32),
  },
  contracts: {
    ConstructorArgsValidation: {
      contract: 'ConstructorArgsValidation',
      constructorArgs: {
        _immutableUint: 1,
      },
    },
  },
}

export default config
