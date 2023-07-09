import { UserChugSplashConfig } from '@chugsplash/core'

const ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const config: UserChugSplashConfig = {
  options: {
    orgOwners: [ownerAddress],
    orgThreshold: 1,
    orgId: '1111',
    networks: ['goerli', 'optimism-goerli'],
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
