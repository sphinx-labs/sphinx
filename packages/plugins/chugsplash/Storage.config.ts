import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import {
  variables,
  constructorArgs,
  complexConstructorArgs,
} from '../test/constants'

const projectName = 'My First Project'
export const orgId = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(projectName)
)

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    MyStorage: {
      contract: 'Storage',
      constructorArgs,
      variables,
    },
    ComplexConstructorArgs: {
      contract: 'ComplexConstructorArgs',
      kind: 'no-proxy',
      unsafeAllowFlexibleConstructor: true,
      constructorArgs: complexConstructorArgs,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      constructorArgs: {
        _immutableContractReference: '{{ MyStorage }}',
        _statelessImmutableContractReference: '{{ Stateless }}',
      },
      variables: {
        myStorage: '{{ MyStorage }}',
        myStateless: '{{ Stateless }}',
      },
    },
    Stateless: {
      contract: 'Stateless',
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 1,
        _immutableContractReference: '{{ MyStorage }}',
      },
    },
  },
}

export default config
