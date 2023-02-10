import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      variables: {
        number: {
          testStr: '{{MyFirstContract}}',
        },
        // '{preserve}': 3,
        // number: {
        //   '{preserve}': 2,
        // },
        // x: {
        //   y: {
        //     '{preserve}': 4
        //   }
        // },
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
