import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'Simple Project',
  },
  contracts: {
    MyContract: {
      contract: 'SimpleStorage',
      variables: {
        myStorage: '0x' + '11'.repeat(20),
      },
    },
  },
}

export default config
