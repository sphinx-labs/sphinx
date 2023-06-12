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
      kind: 'proxy',
      constructorArgs,
      variables,
    },
    ComplexConstructorArgs: {
      contract: 'ComplexConstructorArgs',
      kind: 'immutable',
      unsafeAllow: {
        flexibleConstructor: true,
      },
      constructorArgs: complexConstructorArgs,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      kind: 'proxy',
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
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 1,
        _immutableContractReference: '{{ MyStorage }}',
      },
    },
  },
}

export default config
