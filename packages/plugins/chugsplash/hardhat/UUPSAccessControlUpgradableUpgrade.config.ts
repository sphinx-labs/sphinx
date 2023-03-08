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
      externalProxy: '0xb2AA9bf762878462382A34eB4EC1f041E0071081',
      externalProxyType: 'oz-access-control-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo:
        'artifacts/build-info/1d8d1848289cee57049d6158444e68d5.json',
      previousFullyQualifiedName:
        'contracts/UUPSAccessControlUpgradableV1.sol:UUPSAccessControlUpgradableV1',
    },
  },
}

export default config
