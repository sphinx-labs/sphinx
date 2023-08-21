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
      },
      overrides: [
        {
          chains: ['anvil'],
          constructorArgs: {
            incorrectOverrideArg: 1,
            _intAddress: ethers.ZeroAddress,
          },
        },
        {
          chains: ['optimism-goerli'],
          constructorArgs: {
            _intAddress: ethers.ZeroAddress,
          },
        },
      ],
    },
  },
}

export default config
