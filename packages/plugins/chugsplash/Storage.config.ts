import { UserChugSplashConfig } from '@chugsplash/core'

import { variables, constructorArgs } from '../test/constants'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectID: '0x' + '22'.repeat(32),
  },
  contracts: {
    MyStorage: {
      contract: 'Storage',
      constructorArgs,
      variables,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        myStorage: '{{ MyStorage }}',
      },
    },
  },
}

export default config
