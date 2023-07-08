import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyFirstContract: {
          contract: 'HelloChugSplash',
          kind: 'proxy',
          variables: {
            number: 1,
            stored: true,
            // storageName: 'First',
            // otherStorage: '0x1111111111111111111111111111111111111111',
          },
        },
      },
    },
  },
}

export default config
