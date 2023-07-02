import { UserProjectConfig } from '@chugsplash/core'

import { fetchBuildInfo } from '../../../test/constants'

const projectName = 'UUPSAccessControlUpgradableToken'

const config: UserProjectConfig = {
  contracts: {
    Token: {
      contract: 'UUPSAccessControlUpgradableV2',
      variables: {
        newInt: 1,
        originalInt: 1,
        _initialized: 1,
        _initializing: false,
        'ContextUpgradeable:__gap': '{ gap }',
        'ERC165Upgradeable:__gap': '{ gap }',
        'ERC1967UpgradeUpgradeable:__gap': '{ gap }',
        'AccessControlUpgradeable:__gap': '{ gap }',
        'UUPSUpgradeable:__gap': '{ gap }',
        _roles: [],
      },
      address: '0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E',
      kind: 'oz-access-control-uups',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo: `artifacts/build-info/${fetchBuildInfo()}`,
      previousFullyQualifiedName:
        'contracts/test/UUPSAccessControlUpgradableV1.sol:UUPSAccessControlUpgradableV1',
    },
  },
}

export { config, projectName }
