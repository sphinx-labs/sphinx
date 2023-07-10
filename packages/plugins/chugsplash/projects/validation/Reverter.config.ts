import { UserProjectConfig } from '@chugsplash/core'

const projectName = 'Reverter'

const config: UserProjectConfig = {
  contracts: {
    Reverter1: {
      contract: 'Reverter',
      kind: 'immutable',
    },
    Reverter2: {
      contract: 'Reverter',
      kind: 'immutable',
    },
  },
}

export { config, projectName }
