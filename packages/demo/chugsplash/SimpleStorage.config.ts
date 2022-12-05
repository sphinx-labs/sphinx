import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
  },
  // Below, we define all of the contracts in the deployment along with their state variables.
  contracts: {
    // First contract config:
    FirstSimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: { '!Ref': 'SecondSimpleStorage' }, // Reference to SecondSimpleStorage
      },
    },
    // Second contract config:
    SecondSimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        number: 2,
        stored: true,
        storageName: 'Second',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
