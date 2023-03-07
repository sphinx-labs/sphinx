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
      externalProxy: '0xA7c8B0D74b68EF10511F27e97c379FB1651e1eD2',
      externalProxyType: 'oz-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo:
        'artifacts/build-info/7303da441c6bbfebbb1056a6da5af07d.json',
      previousFullyQualifiedName:
        'contracts/UUPSUpgradableV1.sol:UUPSUpgradableV1',
    },
  },
}

export default config
