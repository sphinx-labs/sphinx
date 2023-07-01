import { UserProjectConfig } from '@chugsplash/core'

const projectName = 'Metatxs'

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
    },
  },
}

export { config, projectName }
