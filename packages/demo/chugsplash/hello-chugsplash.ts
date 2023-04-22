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
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '  {{MyFirstContrfact}}  ',
      },
    },
  },
}

export default config
