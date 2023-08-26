import { UserSphinxConfig } from '@sphinx-labs/core'
import { ethers } from 'ethers'

const projectName = 'ConstructorArgOverrideValidation'

const correctConstructorArgs = {
  _intArg: 0,
  _uintArg: 0,
  _addressArg: ethers.ZeroAddress,
  _otherAddressArg: ethers.ZeroAddress,
}

const config: UserSphinxConfig = {
  projectName,
  options: {
    orgId: 'sphinx',
    ownerThreshold: 1,
    owners: [ethers.ZeroAddress],
    proposers: [ethers.ZeroAddress],
    mainnets: [],
    testnets: ['optimism-goerli', 'arbitrum-goerli'],
  },
  contracts: {
    IncorrectConstructorArgOverrides: {
      contract: 'ConstructorArgs',
      kind: 'immutable',
      constructorArgs: correctConstructorArgs,
      overrides: [
        {
          chains: ['anvil'],
          constructorArgs: {
            incorrectOverrideArg: 1,
            _addressArg: ethers.ZeroAddress,
            otherIncorrectOverrideArg: '0x' + '11'.repeat(20),
          },
        },
        {
          chains: ['optimism-goerli'],
          constructorArgs: {
            _addressArg: ethers.ZeroAddress,
          },
        },
      ],
    },
  },
}

export default config
