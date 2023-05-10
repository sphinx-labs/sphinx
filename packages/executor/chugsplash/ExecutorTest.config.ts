import { UserChugSplashConfig } from '@chugsplash/core'
import { constants } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    organizationID: constants.HashZero,
    projectName: 'Remote Executor Test',
  },
  contracts: {
    ExecutorProxyTest: {
      contract: 'ExecutorProxyTest',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
    ExecutorNonProxyTest: {
      contract: 'ExecutorNonProxyTest',
      kind: 'no-proxy',
      unsafeAllowFlexibleConstructor: true,
      constructorArgs: {
        _val: 1,
      },
    },
  },
}

export default config
