import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import { fetchBuildInfo } from '../../test/constants'

const projectName = 'UUPS Ownable Upgradable Token'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
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
      kind: 'oz-ownable-uups',
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
