import { UserConfigWithOptions } from '@sphinx/core'

const ownerAddress = '0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51'

// Used for testing the website, please do not delete
const config: UserConfigWithOptions = {
  projectName: 'MultiChain Deployments',
  options: {
    orgId: 'cljvzl0om0001cbyqh3jw2tgo',
    owners: [ownerAddress],
    threshold: 1,
    testnets: ['goerli', 'optimism-goerli'],
    mainnets: ['ethereum', 'optimism'],
    proposers: [ownerAddress],
  },
  contracts: {
    TestContract: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 1,
        _immutableAddress: '0x' + '11'.repeat(20),
      },
    },
  },
}

export default config
