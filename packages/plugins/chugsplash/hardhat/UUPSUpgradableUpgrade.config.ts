import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'UUPS Upgradable Token',
  },
  contracts: {
    Token: {
      contract: 'UUPSUpgradableV2',
      variables: {
        newInt: 1,
        originalInt: 1,
        _initialized: 1,
        _initializing: false,
        __gap: [],
        _owner: '0x1111111111111111111111111111111111111111',
      },
      externalProxy: '0x391342f5acAcaaC9DE1dC4eC3E03f2678f7c78F1',
      externalProxyType: 'oz-uups',
    },
  },
}

export default config
