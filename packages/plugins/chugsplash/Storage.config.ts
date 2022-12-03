import { UserChugSplashConfig } from '@chugsplash/core'

import { variables } from '../test/constants'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
  },
  contracts: {
    Storage: {
      contract: 'Storage',
      variables,
    },
  },
}

export default config
