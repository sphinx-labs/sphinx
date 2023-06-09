import { ethers } from 'ethers'
import { UserChugSplashConfig } from '@chugsplash/core'
const projectName = 'Claim test'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    MySimpleStorage: {
      contract: 'SimpleStorage',
      // kind: 'no-proxy',
      // unsafeAllow: {
      //   flexibleConstructor: true
      // },
      variables: {
        myStorage: '0x1111111111111111111111111111111111111111',
        myStateless: '0x1111111111111111111111111111111111111111',
      },
      constructorArgs: {
        _immutableContractReference:
          '0x1111111111111111111111111111111111111111',
        _statelessImmutableContractReference:
          '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
