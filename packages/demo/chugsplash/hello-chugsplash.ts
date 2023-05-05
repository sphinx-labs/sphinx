import { UserChugSplashConfig } from '@chugsplash/core'
import { constants } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    organizationID: constants.HashZero,
    projectName: 'Hello ChugSplash',
    claimer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      kind: 'no-proxy',
      unsafeAllowFlexibleConstructor: true,
      constructorArgs: {
        _number: 1,
        _stored: true,
        _storageName: 'First',
        _otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
