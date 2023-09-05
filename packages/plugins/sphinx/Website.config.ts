import { UserConfigWithOptions } from '@sphinx-labs/core'
import { ethers } from 'ethers'

const ownerAddress = '0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51'

// Used for testing the website, please do not delete
const config: UserConfigWithOptions = {
  projectName: 'Foundry Deployment',
  options: {
    orgId: 'cllycajft0000m9cbahvsc9a5',
    owners: [ownerAddress],
    ownerThreshold: 1,
    testnets: ['arbitrum-goerli', 'optimism-goerli', 'goerli'],
    mainnets: ['ethereum', 'optimism'],
    proposers: [ownerAddress],
    managerVersion: 'v0.2.2',
  },
  contracts: {
    MyContract: {
      contract: 'contracts/test/MyContracts.sol:MyContract1',
      kind: 'immutable',
      constructorArgs: {
        _intArg: 0,
        _uintArg: 0,
        _addressArg: ethers.ZeroAddress,
        _otherAddressArg: ethers.ZeroAddress,
      },
    },
  },
}

export default config
