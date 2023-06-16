import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import { fetchBuildInfo } from '../../test/constants'

const projectName = 'UUPS AccessControl Upgradable Token'

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
      externalProxy: '0x62DB6c1678Ca81ea0d946EA3dd75b4F71421A2aE',
      kind: 'oz-access-control-uups',
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
