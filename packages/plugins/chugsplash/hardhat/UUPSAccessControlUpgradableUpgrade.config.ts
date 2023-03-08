import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'UUPS AccessControl Upgradable Token',
  },
  contracts: {
    Token: {
      contract: 'UUPSAccessControlUpgradableV2',
      variables: {
        newInt: 1,
        originalInt: 1,
        _initialized: 1,
        _initializing: false,
        __gap: [],
        _roles: [],
      },
      externalProxy: '0x62DB6c1678Ca81ea0d946EA3dd75b4F71421A2aE',
      externalProxyType: 'oz-access-control-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo:
        'artifacts/build-info/1af37641d1ff3a00679cea44257f9533.json',
      previousFullyQualifiedName:
        'contracts/UUPSAccessControlUpgradableV1.sol:UUPSAccessControlUpgradableV1',
    },
  },
}

export default config
