import { UserConfigWithOptions } from '@sphinx/core'

const ownerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

// Used for testing the website, please do not delete
const config: UserConfigWithOptions = {
  project: 'MultiChain Deployments',
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
