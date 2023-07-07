import { UserProjectConfig } from '@chugsplash/core'

import {
  variables,
  complexConstructorArgs,
  immutableConstructorArgsOne,
  immutableConstructorArgsTwo,
} from '../../test/constants'

const projectName = 'Storage'

const config: UserProjectConfig = {
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
        _immutableAddress: '{{ MyStorage }}',
      },
    },
  },
}

export { config, projectName }
