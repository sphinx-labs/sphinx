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
      artifact: 'deployments/localhost/MyStorage.json',
      variables,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      artifact: 'deployments/localhost/MySimpleStorage.json',
      variables: {
        myStorage: '{{ MyStorage }}',
      },
    },
  },
}

export default config
