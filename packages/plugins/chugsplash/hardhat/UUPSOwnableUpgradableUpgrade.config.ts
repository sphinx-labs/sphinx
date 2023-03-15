import { UserChugSplashConfig } from '@chugsplash/core'

import { fetchBuildInfo } from '../../test/constants'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'UUPS Ownable Upgradable Token',
  },
  contracts: {
    Token: {
      contract: 'UUPSOwnableUpgradableV2',
      variables: {
        newInt: 1,
        originalInt: 1,
        _initialized: 1,
        _initializing: false,
        'ContextUpgradeable:__gap': [],
        'OwnableUpgradeable:__gap': [],
        'ERC1967UpgradeUpgradeable:__gap': [],
        'UUPSUpgradeable:__gap': [],
        _owner: '{ preserve }',
      },
      externalProxy: '0xA7c8B0D74b68EF10511F27e97c379FB1651e1eD2',
      externalProxyType: 'oz-ownable-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo: `artifacts/build-info/${fetchBuildInfo()}`,
      previousFullyQualifiedName:
        'contracts/UUPSOwnableUpgradableV1.sol:UUPSOwnableUpgradableV1',
    },
  },
}

export default config
