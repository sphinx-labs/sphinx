import { UserChugSplashConfig } from '@chugsplash/core'

import { variables } from '../test/constants'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
  },
  contracts: {
    MyStorage: {
      contract: 'contracts/Storage.t.sol:Storage',
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
