import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: '0x' + '89'.repeat(32),
    projectName: 'Constructor Args Validation',
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
