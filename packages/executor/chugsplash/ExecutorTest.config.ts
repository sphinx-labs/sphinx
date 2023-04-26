import { UserChugSplashConfig } from '@chugsplash/core'
import { constants } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    organizationID: constants.HashZero,
    projectName: 'Remote Executor Test',
    claimer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  contracts: {
    ExecutorTest: {
      contract: 'ExecutorTest',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
