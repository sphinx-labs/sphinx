import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    projectID: '0x' + '44'.repeat(32),
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
