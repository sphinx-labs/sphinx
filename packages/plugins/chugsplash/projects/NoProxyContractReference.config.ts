import { UserProjectConfig } from '@chugsplash/core'

const projectName = 'NoProxy'

const config: UserProjectConfig = {
  contracts: {
    Stateless: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 1,
        _immutableContractReference:
          '0x1111111111111111111111111111111111111111',
      },
      variables: {
        hello: 'world',
      },
    },
    StatelessTwo: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 1,
        _immutableAddress: '{{ Stateless }}',
      },
      variables: {
        hello: 'world',
      },
    },
  },
}

export { config, projectName }
