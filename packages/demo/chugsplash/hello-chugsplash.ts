import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'Test Refactor',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      variables: {
        number: 4,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
