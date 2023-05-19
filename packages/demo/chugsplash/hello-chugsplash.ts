import { UserChugSplashConfig } from '@chugsplash/core'
import { constants } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    organizationID: constants.HashZero,
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      kind: 'no-proxy',
    },
    MyProxy: {
      contract: 'HelloChugSplash',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
        hi: {
          '{{ MyFirstContract }}': 2,
        },
      },
    },
  },
}

export default config
