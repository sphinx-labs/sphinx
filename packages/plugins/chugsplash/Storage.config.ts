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
      proxy: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
      variables,
    },
  },
}

export default config
