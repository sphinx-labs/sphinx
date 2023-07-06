import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyFirstContract: {
          contract: 'HelloChugSplash',
          kind: 'immutable',
          // constructorArgs: {
          //   number: 1,
          //   stored: true,
          //   storageName: 'First',
          //   otherStorage: '0x1111111111111111111111111111111111111111',
          // },
        },
      },
    },
  },
}

export default config
