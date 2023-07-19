import { UserProjectConfig } from '@sphinx/core'

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
