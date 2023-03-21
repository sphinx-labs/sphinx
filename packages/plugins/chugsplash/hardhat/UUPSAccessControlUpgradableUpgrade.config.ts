import { UserChugSplashConfig } from '@chugsplash/core'

import { fetchBuildInfo } from '../../test/constants'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: '0x' + '66'.repeat(32),
  },
  contracts: {
    Token: {
      contract: 'UUPSAccessControlUpgradableV2',
      variables: {
        newInt: 1,
        originalInt: 1,
        _initialized: 1,
        _initializing: false,
        'ContextUpgradeable:__gap': [],
        'ERC165Upgradeable:__gap': [],
        'ERC1967UpgradeUpgradeable:__gap': [],
        'AccessControlUpgradeable:__gap': [],
        'UUPSUpgradeable:__gap': [],
        _roles: [],
      },
      externalProxy: '0x9A7848b9E60C7619f162880c7CA5Cbca80998034',
      externalProxyType: 'oz-access-control-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo: `artifacts/build-info/${fetchBuildInfo()}`,
      previousFullyQualifiedName:
        'contracts/UUPSAccessControlUpgradableV1.sol:UUPSAccessControlUpgradableV1',
    },
  },
}

export default config
