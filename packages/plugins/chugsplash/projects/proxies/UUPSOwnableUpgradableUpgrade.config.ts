import { UserProjectConfig } from '@chugsplash/core'

import { fetchBuildInfo } from '../../../test/constants'

const projectName = 'UUPSOwnableUpgradableToken'

const config: UserProjectConfig = {
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
      kind: 'oz-ownable-uups',
      address: '0x5095d3313C76E8d29163e40a0223A5816a8037D8',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo: `artifacts/build-info/${fetchBuildInfo()}`,
      previousFullyQualifiedName:
        'contracts/test/UUPSOwnableUpgradableV1.sol:UUPSOwnableUpgradableV1',
    },
  },
}

export { config, projectName }
