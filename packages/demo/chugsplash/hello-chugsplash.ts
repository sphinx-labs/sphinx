import { UserChugSplashConfig } from '@chugsplash/core'
import { constants } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
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
