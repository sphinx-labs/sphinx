import { ChugSplashConfig } from '@chugsplash/core'

import { variables } from '../test/constants'

const config: ChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
    projectOwner: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  },
  contracts: {
    Storage: {
      contract: 'Storage',
      variables,
    },
  },
}

export default config
