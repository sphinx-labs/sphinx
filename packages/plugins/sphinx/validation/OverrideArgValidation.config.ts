import { UserSphinxConfig } from '@sphinx-labs/core'
import { ethers } from 'ethers'

const projectName = 'ConstructorArgValidation'

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
    ConstructorArgOverrides: {
      contract: 'ConstructorArgOverrides',
      kind: 'immutable',
      constructorArgs: {
        incorrectDefaultArg: 1,
        _defaultAndIncorrectOverrideArg: ethers.ZeroAddress,
      },
      overrides: [
        {
          chains: ['anvil'],
          constructorArgs: {
            incorrectOverrideArg: 1,
            _addressArg: ethers.ZeroAddress,
            _defaultAndIncorrectOverrideWrong: '0x' + '11'.repeat(20),
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
