import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
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
