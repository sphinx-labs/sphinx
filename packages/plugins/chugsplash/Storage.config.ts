import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import {
  variables,
  complexConstructorArgs,
  immutableConstructorArgsOne,
  immutableConstructorArgsTwo,
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
      contract: 'contracts/test/ContainsStorage.sol:Storage',
      kind: 'proxy',
      constructorArgs: immutableConstructorArgsOne,
      variables,
    },
    MyOtherImmutables: {
      contract: 'contracts/test/ContainsStorage.sol:OtherImmutables',
      kind: 'proxy',
      constructorArgs: immutableConstructorArgsTwo,
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
