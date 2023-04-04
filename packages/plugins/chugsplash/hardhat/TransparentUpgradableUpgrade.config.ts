import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import { fetchBuildInfo } from '../../test/constants'

const projectName = 'Transparent Upgradable Token'

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
      contract: 'TransparentUpgradableV2',
      variables: {
        newInt: 1,
        originalInt: 1,
        _initialized: 1,
        _initializing: false,
        'ContextUpgradeable:__gap': '{ gap }',
        'OwnableUpgradeable:__gap': '{ gap }',
        _owner: '0x1111111111111111111111111111111111111111',
      },
      externalProxy: '0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD',
      kind: 'oz-transparent',
      // We must specify these explicitly because newer versions of OpenZeppelin's Hardhat plugin
      // don't create the Network file in the `.openzeppelin/` folder anymore:
      // https://docs.openzeppelin.com/upgrades-plugins/1.x/network-files#temporary-files
      previousBuildInfo: `artifacts/build-info/${fetchBuildInfo()}`,
      previousFullyQualifiedName:
        'contracts/TransparentUpgradableV1.sol:TransparentUpgradableV1',
    },
  },
}

export default config
