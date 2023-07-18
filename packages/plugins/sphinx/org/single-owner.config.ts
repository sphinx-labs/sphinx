import { UserSphinxConfig } from '@sphinx/core'

const ownerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const config: UserSphinxConfig = {
  options: {
    orgOwners: [ownerAddress],
    orgThreshold: 1,
    orgId: 'cljvzl0om0001cbyqh3jw2tgo',
    mainnets: [],
    testnets: ['goerli', 'optimism-goerli'],
    proposers: [ownerAddress],
    managers: [ownerAddress],
  },
  projects: {
    SingleOwner: {
      options: {
        projectOwners: [ownerAddress],
        projectThreshold: 1,
      },
      contracts: {
        MyContract: {
          contract: 'Stateless',
          kind: 'immutable',
          constructorArgs: {
            _immutableUint: 1,
            _immutableAddress: '0x' + '11'.repeat(20),
          },
        },
      },
    },
  },
}

export default config
