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
      externalProxy: '0xC92B72ecf468D2642992b195bea99F9B9BB4A838',
      externalProxyType: 'oz-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo:
        'artifacts/build-info/9be231364fa551f736fe8fa2e63af298.json',
      previousFullyQualifiedName:
        'contracts/UUPSUpgradableV1.sol:UUPSUpgradableV1',
    },
  },
}

export default config
