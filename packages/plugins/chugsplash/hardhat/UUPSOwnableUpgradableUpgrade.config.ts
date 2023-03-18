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
        'ContextUpgradeable:__gap': '{ gap }',
        'OwnableUpgradeable:__gap': '{ gap }',
        'ERC1967UpgradeUpgradeable:__gap': '{ gap }',
        'UUPSUpgradeable:__gap': '{ gap }',
        _owner: '{ preserve }',
      },
      externalProxy: '0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8',
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
