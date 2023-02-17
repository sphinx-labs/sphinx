import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      deployedStorageLayout:
        'artifacts/build-info/8dd3a7e47faf67395b65c67ed31b4c83.json',
      deployedFullyQualifiedName:
        'contracts/HelloChugSplash.sol:HelloChugSplash',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
