import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      variables: {
        number: '{preserve}',
        // stored: '{preserve}',
        // storageName: '{preserve}',
        otherStorage: '0x1111111111111111111111111111111111111111',
        // x: 2,
        // complex: {
          // a: '{preserve}',
          // b: {
            // x: {
              // y: 2,
            // },
          // },
        // },
        // number: 4,
        stored: '{preserve}',
        storageName: 'First',
      },
    },
  },
}

export default config
