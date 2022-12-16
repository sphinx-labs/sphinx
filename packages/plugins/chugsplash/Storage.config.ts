import { UserChugSplashConfig } from '@chugsplash/core'

import { variables } from '../test/constants'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
  },
  contracts: {
    MyStorage: {
      contract: 'Storage',
      variables,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        myStorage: { '!Ref': 'MyStorage' },
      },
    },
  },
}

export default config
